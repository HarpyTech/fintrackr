from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    username: EmailStr
    password: str = Field(min_length=8)


class UserVerifySignup(BaseModel):
    username: EmailStr
    otp: str = Field(min_length=4, max_length=8)


class UserResendOtp(BaseModel):
    username: EmailStr


class UserLogin(BaseModel):
    username: EmailStr
    password: str


class UserPublic(BaseModel):
    username: EmailStr
    role: str


class UserInDB(UserPublic):
    password_hash: str
    email_verified: bool = False


class UserProfile(BaseModel):
    username: EmailStr
    role: str
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    address: str | None = None


class UserProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=250)


class ForgotPasswordRequest(BaseModel):
    username: EmailStr


class ResetPasswordPayload(BaseModel):
    username: EmailStr
    otp: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=8)
