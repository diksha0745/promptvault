from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import os
import re
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError

env_path = os.path.join(os.path.dirname(__file__), ".env")
enc_path = os.path.join(os.path.dirname(__file__), ".enc")

if os.path.exists(env_path):
    load_dotenv(env_path)

if os.path.exists(enc_path):
    load_dotenv(enc_path, override=True)
elif not os.path.exists(env_path):
    load_dotenv()
from sqlalchemy.orm import Session

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import Base, engine, get_db
from models import (
    AnalyticsPoint,
    AnalyticsResponse,
    CopyStats,
    OptimizeRequest,
    OptimizeResponse,
    Prompt,
    PromptCreate,
    PromptEvent,
    PromptRead,
    PromptRunRequest,
    PromptRunResponse,
    PromptUpdate,
    PromptVersion,
    PromptVersionCreate,
    PromptVersionRead,
    Token,
    ToolTag,
    User,
    UserCreate,
    UserRead,
    Workspace,
    WorkspaceCreate,
    WorkspaceRead,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PromptVault Pro API",
    version="2.0.0",
    description="Team prompt-management API with auth, versioning, analytics, and AI workflows.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
VARIABLE_RE = re.compile(r"\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}")


@app.on_event("startup")
async def startup() -> None:
    Base.metadata.create_all(bind=engine)


def compile_prompt(template: str, variables: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = variables.get(key, "")
        return value.strip() if value and value.strip() else f"{{{{{key}}}}}"

    return VARIABLE_RE.sub(replace, template)


def get_workspace_for_user(db: Session, workspace_id: int, user: User) -> Workspace:
    workspace = db.get(Workspace, workspace_id)
    if workspace is None or user not in workspace.members:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


def resolve_ai_provider(provider: str | None = None) -> str:
    if provider in ("openai", "google"):
        if provider == "openai":
            if os.getenv("OPENAI_API_KEY"):
                return "openai"
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OPENAI_API_KEY is not configured on the backend.",
            )
        if provider == "google":
            if os.getenv("GOOGLE_API_KEY"):
                return "google"
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="GOOGLE_API_KEY is not configured on the backend.",
            )
    if os.getenv("GOOGLE_API_KEY"):
        return "google"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="No supported AI provider is configured on the backend.",
    )


async def call_google(messages: list[dict[str, str]], model: str | None = None) -> tuple[str, str]:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GOOGLE_API_KEY is not configured on the backend.",
        )

    from httpx import AsyncClient, HTTPError

    selected_model = model or os.getenv("GOOGLE_MODEL", "gemini-2.5-flash")
    if not selected_model.startswith("models/"):
        selected_model = f"models/{selected_model}"

    prompt_text = "\n\n".join(
        f"SYSTEM: {msg['content']}" if msg["role"] == "system" else f"USER: {msg['content']}" for msg in messages
    )
    request_body: dict[str, object] = {
        "model": selected_model,
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt_text}],
            }
        ],
        "generationConfig": {"temperature": 0.7},
    }

    url = f"https://generativelanguage.googleapis.com/v1/{selected_model}:generateContent?key={api_key}"
    try:
        async with AsyncClient(timeout=30) as client:
            response = await client.post(url, json=request_body)
    except HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google request failed: {exc}",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google request failed ({response.status_code}): {response.text}",
        )

    data = response.json()
    if "candidates" in data:
        candidates = data.get("candidates", [])
        if not candidates:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Google request returned no response: {data}",
            )
        candidate = candidates[0]
        content_parts: list[str] = []
        content_obj = candidate.get("content", {})
        if isinstance(content_obj, dict):
            for part in content_obj.get("parts", []):
                if isinstance(part, dict) and part.get("text"):
                    content_parts.append(part.get("text", ""))
        elif isinstance(content_obj, list):
            for item in content_obj:
                if item.get("type") == "output_text":
                    content_parts.append(item.get("text", ""))
                elif item.get("text"):
                    content_parts.append(item.get("text", ""))
        content = "".join(content_parts).strip()
    else:
        content = data.get("output", "") or data.get("result", "") or ""

    if not content:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google request returned no usable content: {data}",
        )

    return selected_model, content


def can_access_prompt(prompt: Prompt, user: User) -> bool:
    return prompt.owner_id == user.id or (prompt.workspace is not None and user in prompt.workspace.members)


def can_modify_prompt(prompt: Prompt, user: User) -> bool:
    return prompt.owner_id == user.id or (prompt.workspace is not None and user in prompt.workspace.members)


def get_accessible_prompt(db: Session, prompt_id: int, user: User, *, write: bool = False) -> Prompt:
    prompt = db.get(Prompt, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    allowed = can_modify_prompt(prompt, user) if write else can_access_prompt(prompt, user)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return prompt


def query_accessible_prompts(
    db: Session,
    user: User,
    tool_tag: ToolTag | None = None,
    search: str | None = None,
    workspace_id: int | None = None,
) -> list[Prompt]:
    workspace_ids = [workspace.id for workspace in user.workspaces]
    access_filter = or_(
        Prompt.owner_id == user.id,
        and_(Prompt.workspace_id.in_(workspace_ids), Prompt.workspace_id.isnot(None)),
    )
    stmt = select(Prompt).where(access_filter).order_by(Prompt.updated_at.desc(), Prompt.id.desc())

    if tool_tag is not None:
        stmt = stmt.where(Prompt.tool_tag == tool_tag)
    if workspace_id is not None:
        get_workspace_for_user(db, workspace_id, user)
        stmt = stmt.where(Prompt.workspace_id == workspace_id)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Prompt.title.ilike(term),
                Prompt.prompt_template.ilike(term),
                Prompt.system_context.ilike(term),
            )
        )

    return list(db.scalars(stmt).all())


def snapshot_prompt(db: Session, prompt: Prompt, version_label: str, notes: str | None = None) -> PromptVersion:
    version = PromptVersion(
        prompt_id=prompt.id,
        version_label=version_label,
        title=prompt.title,
        system_context=prompt.system_context,
        prompt_template=prompt.prompt_template,
        tool_tag=prompt.tool_tag,
        visibility=prompt.visibility,
        notes=notes,
    )
    db.add(version)
    return version


async def call_openai(messages: list[dict[str, str]], model: str | None = None) -> tuple[str, str]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENAI_API_KEY is not configured on the backend.",
        )

    from openai import AsyncOpenAI, OpenAIError

    selected_model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    client = AsyncOpenAI(api_key=api_key)
    try:
        completion = await client.chat.completions.create(model=selected_model, messages=messages)
    except OpenAIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"OpenAI request failed: {exc}",
        )
    content = completion.choices[0].message.content or ""
    return selected_model, content


async def call_model(messages: list[dict[str, str]], model: str | None = None, provider: str | None = None) -> tuple[str, str]:
    provider = resolve_ai_provider(provider)
    if provider == "google":
        return await call_google(messages, model)
    return await call_openai(messages, model)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register", response_model=Token, status_code=status.HTTP_201_CREATED, tags=["auth"])
async def register(payload: UserCreate, db: DbSession) -> Token:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=payload.email.lower(), full_name=payload.full_name, hashed_password=hash_password(payload.password))
    workspace = Workspace(name=f"{payload.full_name}'s Workspace", created_by_id=None)
    workspace.members.append(user)
    db.add_all([user, workspace])
    db.commit()
    db.refresh(user)
    return Token(access_token=create_access_token(str(user.id)), user=user)


@app.post("/auth/login", response_model=Token, tags=["auth"])
async def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession) -> Token:
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return Token(access_token=create_access_token(str(user.id)), user=user)


@app.get("/auth/me", response_model=UserRead, tags=["auth"])
async def me(user: CurrentUser) -> User:
    return user


@app.get("/workspaces", response_model=list[WorkspaceRead], tags=["workspaces"])
async def list_workspaces(user: CurrentUser) -> list[Workspace]:
    return list(user.workspaces)


@app.post("/workspaces", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED, tags=["workspaces"])
async def create_workspace(payload: WorkspaceCreate, db: DbSession, user: CurrentUser) -> Workspace:
    workspace = Workspace(name=payload.name, created_by_id=user.id)
    workspace.members.append(user)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


@app.get("/prompts", response_model=list[PromptRead], tags=["prompts"])
async def list_prompts(
    db: DbSession,
    user: CurrentUser,
    tool_tag: ToolTag | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
    workspace_id: int | None = Query(default=None),
) -> list[Prompt]:
    return query_accessible_prompts(db, user, tool_tag, search, workspace_id)


@app.post("/prompts", response_model=PromptRead, status_code=status.HTTP_201_CREATED, tags=["prompts"])
async def create_prompt(prompt: PromptCreate, db: DbSession, user: CurrentUser) -> Prompt:
    if prompt.workspace_id is not None:
        get_workspace_for_user(db, prompt.workspace_id, user)
    entity = Prompt(**prompt.model_dump(), owner_id=user.id)
    db.add(entity)
    db.flush()
    snapshot_prompt(db, entity, "v1.0", "Initial snapshot")
    db.commit()
    db.refresh(entity)
    return entity


@app.patch("/prompts/{prompt_id}", response_model=PromptRead, tags=["prompts"])
async def update_prompt(prompt_id: int, payload: PromptUpdate, db: DbSession, user: CurrentUser) -> Prompt:
    prompt = get_accessible_prompt(db, prompt_id, user, write=True)
    data = payload.model_dump(exclude_unset=True)
    if "workspace_id" in data and data["workspace_id"] is not None:
        get_workspace_for_user(db, data["workspace_id"], user)
    for key, value in data.items():
        setattr(prompt, key, value)
    db.commit()
    db.refresh(prompt)
    return prompt


@app.put("/prompts/{prompt_id}/copy", response_model=CopyStats, tags=["prompts"])
async def copy_prompt(prompt_id: int, db: DbSession, user: CurrentUser, variables: dict[str, str] | None = None) -> CopyStats:
    prompt = get_accessible_prompt(db, prompt_id, user)
    prompt.times_copied += 1
    db.add(PromptEvent(prompt_id=prompt.id, user_id=user.id, event_type="copy", variables=variables or {}))
    db.commit()
    db.refresh(prompt)
    return CopyStats(id=prompt.id, times_copied=prompt.times_copied)


@app.delete("/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["prompts"])
async def delete_prompt(prompt_id: int, db: DbSession, user: CurrentUser) -> Response:
    prompt = get_accessible_prompt(db, prompt_id, user, write=True)
    db.delete(prompt)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/prompts/{prompt_id}/versions", response_model=list[PromptVersionRead], tags=["versions"])
async def list_versions(prompt_id: int, db: DbSession, user: CurrentUser) -> list[PromptVersion]:
    prompt = get_accessible_prompt(db, prompt_id, user)
    return list(db.scalars(select(PromptVersion).where(PromptVersion.prompt_id == prompt.id).order_by(PromptVersion.created_at.desc())).all())


@app.post("/prompts/{prompt_id}/versions", response_model=PromptVersionRead, status_code=status.HTTP_201_CREATED, tags=["versions"])
async def create_version(prompt_id: int, payload: PromptVersionCreate, db: DbSession, user: CurrentUser) -> PromptVersion:
    prompt = get_accessible_prompt(db, prompt_id, user, write=True)
    version = snapshot_prompt(db, prompt, payload.version_label, payload.notes)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Version label '{payload.version_label}' already exists for this prompt.",
        ) from exc
    db.refresh(version)
    return version


@app.post("/prompts/{prompt_id}/versions/{version_id}/rollback", response_model=PromptRead, tags=["versions"])
async def rollback_version(prompt_id: int, version_id: int, db: DbSession, user: CurrentUser) -> Prompt:
    prompt = get_accessible_prompt(db, prompt_id, user, write=True)
    version = db.get(PromptVersion, version_id)
    if version is None or version.prompt_id != prompt.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    snapshot_prompt(db, prompt, f"rollback-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}", "Automatic pre-rollback snapshot")
    prompt.title = version.title
    prompt.system_context = version.system_context
    prompt.prompt_template = version.prompt_template
    prompt.tool_tag = version.tool_tag
    db.commit()
    db.refresh(prompt)
    return prompt


@app.post("/prompts/{prompt_id}/run-test", response_model=PromptRunResponse, tags=["ai"])
async def run_prompt(prompt_id: int, payload: PromptRunRequest, db: DbSession, user: CurrentUser) -> PromptRunResponse:
    prompt = get_accessible_prompt(db, prompt_id, user)
    compiled = compile_prompt(prompt.prompt_template, payload.variables)
    messages = []
    if prompt.system_context:
        messages.append({"role": "system", "content": prompt.system_context})
    messages.append({"role": "user", "content": compiled})
    provider = resolve_ai_provider(payload.provider)
    model, response = await call_model(messages, payload.model, provider=provider)
    db.add(PromptEvent(prompt_id=prompt.id, user_id=user.id, event_type="run_test", variables=payload.variables))
    db.commit()
    return PromptRunResponse(provider=provider, model=model, compiled_prompt=compiled, response=response)


@app.post("/ai/optimize", response_model=OptimizeResponse, tags=["ai"])
async def optimize_prompt(payload: OptimizeRequest, user: CurrentUser) -> OptimizeResponse:
    messages = [
        {
            "role": "system",
            "content": "Rewrite prompts for production LLM applications. Preserve variables written as {{name}}. Return only the optimized prompt.",
        },
        {
            "role": "user",
            "content": f"System context:\n{payload.system_context or 'None'}\n\nDraft prompt:\n{payload.prompt}",
        },
    ]
    _, optimized = await call_model(messages, payload.model)
    return OptimizeResponse(optimized_prompt=optimized)


@app.get("/analytics", response_model=AnalyticsResponse, tags=["analytics"])
async def analytics(db: DbSession, user: CurrentUser) -> AnalyticsResponse:
    prompts = query_accessible_prompts(db, user)
    prompt_ids = [prompt.id for prompt in prompts]
    if not prompt_ids:
        return AnalyticsResponse(copies_over_time=[], tag_performance=[], variable_usage=[], total_copies=0)

    since = datetime.now(timezone.utc) - timedelta(days=13)
    events = list(
        db.scalars(
            select(PromptEvent)
            .where(PromptEvent.prompt_id.in_(prompt_ids), PromptEvent.created_at >= since)
            .order_by(PromptEvent.created_at.asc())
        ).all()
    )
    prompt_by_id = {prompt.id: prompt for prompt in prompts}
    date_counts: dict[str, int] = defaultdict(int)
    tag_counts: Counter[str] = Counter()
    variable_counts: Counter[str] = Counter()

    for event in events:
        if event.event_type == "copy":
            date_counts[event.created_at.strftime("%b %d")] += 1
            tag_counts[prompt_by_id[event.prompt_id].tool_tag] += 1
        for key, value in (event.variables or {}).items():
            if value:
                variable_counts[key] += 1

    copies_over_time = [
        AnalyticsPoint(label=(since + timedelta(days=offset)).strftime("%b %d"), value=date_counts[(since + timedelta(days=offset)).strftime("%b %d")])
        for offset in range(14)
    ]
    return AnalyticsResponse(
        copies_over_time=copies_over_time,
        tag_performance=[AnalyticsPoint(label=label, value=value) for label, value in tag_counts.most_common()],
        variable_usage=[AnalyticsPoint(label=label, value=value) for label, value in variable_counts.most_common(8)],
        total_copies=sum(prompt.times_copied for prompt in prompts),
    )
