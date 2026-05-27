from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import CopyStats, Prompt, PromptCreate, PromptRead, ToolTag

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PromptVault Pro API",
    version="1.0.0",
    description="Enterprise prompt-management API for PromptVault Pro.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DbSession = Annotated[Session, Depends(get_db)]


@app.on_event("startup")
async def startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/prompts", response_model=list[PromptRead], tags=["prompts"])
async def list_prompts(
    db: DbSession,
    tool_tag: ToolTag | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
) -> list[Prompt]:
    stmt = select(Prompt).order_by(Prompt.created_at.desc(), Prompt.id.desc())

    if tool_tag is not None:
        stmt = stmt.where(Prompt.tool_tag == tool_tag)

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


@app.post(
    "/prompts",
    response_model=PromptRead,
    status_code=status.HTTP_201_CREATED,
    tags=["prompts"],
)
async def create_prompt(prompt: PromptCreate, db: DbSession) -> Prompt:
    entity = Prompt(**prompt.model_dump())
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


@app.put("/prompts/{prompt_id}/copy", response_model=CopyStats, tags=["prompts"])
async def copy_prompt(prompt_id: int, db: DbSession) -> CopyStats:
    prompt = db.get(Prompt, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")

    prompt.times_copied += 1
    db.commit()
    db.refresh(prompt)
    return CopyStats(id=prompt.id, times_copied=prompt.times_copied)


@app.delete("/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["prompts"])
async def delete_prompt(prompt_id: int, db: DbSession) -> Response:
    prompt = db.get(Prompt, prompt_id)
    if prompt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")

    db.delete(prompt)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
