from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import CheckConstraint, Column, DateTime, Integer, String, Text, func

from database import Base

ToolTag = Literal["Cursor", "Claude", "GPT-4", "OpenAI"]


class Prompt(Base):
    __tablename__ = "prompts"
    __table_args__ = (
        CheckConstraint(
            "tool_tag IN ('Cursor', 'Claude', 'GPT-4', 'OpenAI')",
            name="ck_prompts_tool_tag",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    system_context = Column(Text, nullable=True)
    prompt_template = Column(Text, nullable=False)
    tool_tag = Column(String, nullable=False, index=True)
    times_copied = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PromptBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=180)
    system_context: str | None = None
    prompt_template: str = Field(..., min_length=1)
    tool_tag: ToolTag


class PromptCreate(PromptBase):
    pass


class PromptRead(PromptBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    times_copied: int
    created_at: datetime


class CopyStats(BaseModel):
    id: int
    times_copied: int
