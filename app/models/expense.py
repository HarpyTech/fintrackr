from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


BillType = Literal["grocery", "restaurant", "service", "utility", "other"]
ExpenseInputType = Literal[
    "manual",
    "text",
    "image",
    "camera",
    "mixed",
]
ExpenseLlmModel = Literal["gemini-2.5-flash",]


class ExpenseLineItem(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    quantity: float = Field(default=1, gt=0)
    unit_price: float = Field(gt=0)
    total: float = Field(gt=0)


class ExpenseCreate(BaseModel):
    amount: float = Field(gt=0)
    category: str = Field(default="other", min_length=2, max_length=64)
    bill_type: BillType = "other"
    input_type: ExpenseInputType = "manual"
    invoice_number: str = Field(default="", max_length=64)
    vendor: str = Field(default="", max_length=128)
    description: str = Field(default="", max_length=255)
    expense_date: date
    line_items: list[ExpenseLineItem] = Field(default_factory=list)


class ExpenseChatCreateRequest(BaseModel):
    message: str = Field(min_length=5, max_length=1000)


class ExpenseItem(BaseModel):
    id: str
    amount: float
    category: str
    bill_type: BillType
    input_type: ExpenseInputType
    invoice_number: str
    vendor: str
    description: str
    expense_date: date
    llm_model: ExpenseLlmModel | None = None
    line_items: list[ExpenseLineItem] = Field(default_factory=list)
