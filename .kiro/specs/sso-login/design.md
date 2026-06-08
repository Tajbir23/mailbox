# Design Document: SSO Login

## Overview

This design adds Google and GitHub OAuth SSO login to the existing NextAuth.js credentials-based authentication system. The implementation uses NextAuth.js built-in OAuth providers, extends the MongoDB User model to support optional passwords and account links, and updates the login/register UI to display provider buttons.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                       │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │Login Page│  │Register Page │  │ Settings Page      │  │
│  │(SSO btns)│  │(SSO btns)   │  │ (Link/Unlink SSO) │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
└───────┼────────────────┼───────────────────┼─────────────┘
        │                │                   │
        ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│                  NextAuth.js API Route                    │
│  /api/auth/[...nextauth]                                 │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Providers: Credentials | Google | GitHub         │    │
│  │ Callbacks: signIn | jwt | session                │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      MongoDB                             │
│  ┌──────────┐    ┌──────────────┐                        │
│  │  Users   │───▶│   Accounts   │                        │
│  │Collection│    │  Collection  │                        │
│  └──────────┘    └──────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: SSO Login

1. User clicks "Sign in with Google/GitHub" on Login_Page
2. NextAuth.js redirects to the provider's OAuth consent screen
3. Provider redirects back to `/api/auth/callback/{provider}` with auth code
4. NextAuth.js exchanges code for tokens and fetches user profile
5. `signIn` callback checks if user exists by email → links or creates
6. JWT callback populates token with user ID, role, canAccessCheckout
7. User is redirected to `/dashboard`

## Database Schema Changes

### Updated User Model

```javascript
// lib/models/User.js - Updated schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: false, default: null }, // Now optional for SSO users
  role: { type: String, enum: ["admin", "user"], default: "user" },
  canAccessCheckout: { type: Boolean, default: false },
  resetTokenHash: { type: String, default: null, select: false },
  resetTokenExpiry: { type: Date, default: null, select: false },
  authProvider: { type: String, enum: ["credentials", "google", "github", "mixed"], default: "credentials" },
}, { timestamps: true });
```

### New Account Model

```javascript
// lib/models/Account.js
const AccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  provider: { type: String, required: true },        // "google" | "github"
  providerAccountId: { type: String, required: true }, // Provider's unique user ID
  accessToken: { type: String, select: false },
  refreshToken: { type: String, select: false },
  expiresAt: { type: Number },
}, { timestamps: true });

AccountSchema.index({ userId: 1, provider: 1 }, { unique: true });
AccountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
```

## Implementation Details

### 1. Auth Configuration (`lib/auth.js`)

Extend `authOptions` to include Google and GitHub providers conditionally:

```javascript
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";

const providers = [CredentialsProvider({ ... })]; // existing

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }));
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(GitHubProvider({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }));
}
```

### 2. Callbacks Strategy

**signIn callback**: Handle account linking and user creation
```javascript
async signIn({ user, account, profile }) {
  if (account.provider === "credentials") return true;
  
  await dbConnect();
  let existingUser = await User.findOne({ email: user.email.toLowerCase() });
  
  if (!existingUser) {
    // Create new user for SSO signup
    existingUser = await User.create({
      name: user.name,
      email: user.email.toLowerCase(),
      password: null,
      authProvider: account.provider,
    });
  } else if (existingUser.authProvider === "credentials") {
    existingUser.authProvider = "mixed";
    await existingUser.save();
  }
  
  // Upsert the account link
  await Account.findOneAndUpdate(
    { userId: existingUser._id, provider: account.provider },
    { providerAccountId: account.providerAccountId, accessToken: account.access_token },
    { upsert: true }
  );
  
  user.id = existingUser._id.toString();
  user.role = existingUser.role;
  user.canAccessCheckout = existingUser.canAccessCheckout;
  return true;
}
```

**jwt callback**: Enrich token with user data from DB for OAuth logins
```javascript
async jwt({ token, user, account }) {
  if (user) {
    token.id = user.id;
    token.role = user.role;
    token.canAccessCheckout = user.canAccessCheckout;
  }
  return token;
}
```

### 3. Login Page UI Changes

Add SSO buttons above or below the existing form with a divider:

```jsx
// Provider buttons section
<div className="space-y-3 mb-6">
  {providers.includes("google") && (
    <button onClick={() => signIn("google")} className="btn-oauth w-full">
      <GoogleIcon /> Continue with Google
    </button>
  )}
  {providers.includes("github") && (
    <button onClick={() => signIn("github")} className="btn-oauth w-full">
      <GitHubIcon /> Continue with GitHub
    </button>
  )}
</div>
<div className="divider">or</div>
```

### 4. Available Providers API

Create an endpoint or use NextAuth's built-in `getProviders()` to determine which providers to show on the client:

```javascript
// Use next-auth/react's getProviders() on client
import { getProviders } from "next-auth/react";
```

### 5. Multi-Tenant Callback URL

The existing `customHandler` in `[...nextauth]/route.js` already sets `NEXTAUTH_URL` dynamically based on the request host. This ensures OAuth callbacks resolve to the correct domain. No additional changes needed for multi-tenant support.

### 6. Settings Page: Account Links

New API endpoints:
- `GET /api/user/linked-accounts` — Returns linked SSO providers for current user
- `DELETE /api/user/linked-accounts/[provider]` — Unlinks a provider (with validation)
- `POST /api/user/password` — Already exists; SSO users use it to set initial password

### 7. Admin Panel Updates

Update the admin users list API to include `authProvider` field from User model so admins can see authentication method per user.

## Environment Variables

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

## Security Considerations

- OAuth state parameter is handled automatically by NextAuth.js to prevent CSRF
- Access tokens are stored with `select: false` and never exposed to the client
- Email-based account linking assumes the OAuth provider has verified the email (Google and GitHub both verify emails)
- Password field becomes optional only for users who sign up exclusively via SSO

## Error Handling

- Provider authorization denied → redirect to `/login?error=OAuthAccountNotLinked` or similar
- Provider returns no email → reject sign-in with descriptive error
- Network failure during OAuth exchange → NextAuth.js default error page with retry option

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `lib/auth.js` | Modified | Add Google/GitHub providers, signIn callback, jwt callback updates |
| `lib/models/User.js` | Modified | Make password optional, add authProvider field |
| `lib/models/Account.js` | New | Account link model for SSO provider associations |
| `app/(auth)/login/page.js` | Modified | Add SSO provider buttons |
| `app/(auth)/register/page.js` | Modified | Add SSO provider buttons |
| `app/api/user/linked-accounts/route.js` | New | GET linked accounts for settings page |
| `app/api/user/linked-accounts/[provider]/route.js` | New | DELETE to unlink a provider |
| `app/dashboard/settings/page.js` | Modified | Show linked accounts section |
| `app/api/admin/users/route.js` | Modified | Include authProvider in user list response |
| `.env.local` | Modified | Add OAuth credential env vars |
