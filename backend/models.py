from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from database import Base

ToolTag = Literal["Cursor", "Claude", "GPT-4", "OpenAI"]

workspace_members = Table(
    "workspace_members",
    Base.metadata,
    Column("workspace_id", ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(180), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    prompts = relationship("Prompt", back_populates="owner", cascade="all, delete-orphan")
    workspaces = relationship("Workspace", secondary=workspace_members, back_populates="members")


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(160), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    members = relationship("User", secondary=workspace_members, back_populates="workspaces")
    prompts = relationship("Prompt", back_populates="workspace")


class Prompt(Base):
    __tablename__ = "prompts"
    __table_args__ = (
        CheckConstraint(
            "tool_tag IN ('Cursor', 'Claude', 'GPT-4', 'OpenAI')",
            name="ck_prompts_tool_tag",
        ),
        CheckConstraint(
            "visibility IN ('private', 'workspace', 'public')",
            name="ck_prompts_visibility",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(180), index=True, nullable=False)
    system_context = Column(Text, nullable=True)
    prompt_template = Column(Text, nullable=False)
    tool_tag = Column(String, nullable=False, index=True)
    visibility = Column(String, nullable=False, default="private", server_default="private", index=True)
    times_copied = Column(Integer, nullable=False, default=0, server_default="0")
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="prompts")
    workspace = relationship("Workspace", back_populates="prompts")
    versions = relationship("PromptVersion", back_populates="prompt", cascade="all, delete-orphan")
    events = relationship("PromptEvent", back_populates="prompt", cascade="all, delete-orphan")


class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    __table_args__ = (UniqueConstraint("prompt_id", "version_label", name="uq_prompt_version_label"),)

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False, index=True)
    version_label = Column(String(40), nullable=False)
    title = Column(String(180), nullable=False)
    system_context = Column(Text, nullable=True)
    prompt_template = Column(Text, nullable=False)
    tool_tag = Column(String, nullable=False)
    visibility = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    prompt = relationship("Prompt", back_populates="versions")


class PromptEvent(Base):
    __tablename__ = "prompt_events"

    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    variables = Column(JSON, nullable=True)
    code_format = Column(String(40), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    prompt = relationship("Prompt", back_populates="events")


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=180)
    password: str = Field(..., min_length=8, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)


class WorkspaceRead(WorkspaceCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class PromptBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=180)
    system_context: str | None = None
    prompt_template: str = Field(..., min_length=1)
    tool_tag: ToolTag
    workspace_id: int | None = None


class PromptCreate(PromptBase):
    pass


class PromptUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    system_context: str | None = None
    prompt_template: str | None = Field(default=None, min_length=1)
    tool_tag: ToolTag | None = None
    workspace_id: int | None = None


class PromptRead(PromptBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    times_copied: int
    owner_id: int
    created_at: datetime
    updated_at: datetime


class PromptVersionCreate(BaseModel):
    version_label: str = Field(..., min_length=1, max_length=40)
    notes: str | None = None


class PromptVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    prompt_id: int
    version_label: str
    title: str
    system_context: str | None
    prompt_template: str
    tool_tag: str
    visibility: str
    notes: str | None
    created_at: datetime


class CopyStats(BaseModel):
    id: int
    times_copied: int


class PromptRunRequest(BaseModel):
    variables: dict[str, str] = Field(default_factory=dict)
    provider: Literal["openai", "google"] = "google"
    model: str | None = None


class PromptRunResponse(BaseModel):
    provider: str
    model: str
    compiled_prompt: str
    response: str


class OptimizeRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    system_context: str | None = None
    model: str | None = None


class OptimizeResponse(BaseModel):
    optimized_prompt: str


class AnalyticsPoint(BaseModel):
    label: str
    value: int


class AnalyticsResponse(BaseModel):
    copies_over_time: list[AnalyticsPoint]
    tag_performance: list[AnalyticsPoint]
    variable_usage: list[AnalyticsPoint]
    total_copies: int
