# Implementation Tasks: SSO Login

## Task 1: Database Schema Updates

- [ ] 1.1 Update User model (`lib/models/User.js`) to make `password` field optional (required: false, default: null) and add `authProvider` field (enum: credentials, google, github, mixed)
- [ ] 1.2 Create Account model (`lib/models/Account.js`) with fields: userId, provider, providerAccountId, accessToken, refreshToken, expiresAt, and compound indexes
- [ ] 1.3 Update the registration API (`app/api/auth/register/route.js`) to handle the now-optional password field correctly (still require password for credentials registration)

## Task 2: NextAuth.js Provider Configuration

- [ ] 2.1 Install `next-auth` Google and GitHub provider dependencies (already included in next-auth package)
- [ ] 2.2 Update `lib/auth.js` to conditionally add GoogleProvider when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars are set
- [ ] 2.3 Update `lib/auth.js` to conditionally add GitHubProvider when `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` env vars are set
- [ ] 2.4 Add `.env.local` template entries for Google and GitHub OAuth credentials

## Task 3: Auth Callbacks for SSO Account Linking

- [ ] 3.1 Add `signIn` callback to `lib/auth.js` that handles account linking — find existing user by email or create new user when signing in via OAuth provider
- [ ] 3.2 Update the `jwt` callback in `lib/auth.js` to populate token with user ID, role, and canAccessCheckout from the database for OAuth logins
- [ ] 3.3 Ensure the `session` callback continues to expose id, role, and canAccessCheckout to the client session for both credentials and OAuth users

## Task 4: Login Page SSO Buttons

- [ ] 4.1 Create a reusable `SSOButtons` component (`components/SSOButtons.js`) that fetches available providers via `getProviders()` and renders styled buttons for Google and GitHub
- [ ] 4.2 Update `app/(auth)/login/page.js` to include the SSOButtons component with an "or" divider between SSO buttons and the credentials form
- [ ] 4.3 Add error handling on the login page for OAuth errors (read `error` query param and display appropriate messages)

## Task 5: Register Page SSO Buttons

- [ ] 5.1 Update `app/(auth)/register/page.js` to include the SSOButtons component with appropriate "Sign up with" labeling
- [ ] 5.2 Ensure SSO signup from register page creates user with role "user" and no password

## Task 6: Account Management API

- [ ] 6.1 Create `app/api/user/linked-accounts/route.js` (GET) to return linked SSO providers for the authenticated user
- [ ] 6.2 Create `app/api/user/linked-accounts/[provider]/route.js` (DELETE) to unlink a provider, with validation that user retains at least one auth method
- [ ] 6.3 Update the existing password API (`app/api/user/password/route.js`) to allow SSO-only users to set an initial password without providing a current password

## Task 7: Settings Page UI for Linked Accounts

- [ ] 7.1 Add a "Linked Accounts" section to the settings/profile page showing connected SSO providers
- [ ] 7.2 Add "Link" buttons for providers not yet connected (triggers `signIn(provider)`)
- [ ] 7.3 Add "Unlink" buttons for connected providers (calls DELETE endpoint) with confirmation and validation error display

## Task 8: Admin Panel Updates

- [ ] 8.1 Update `app/api/admin/users/route.js` to include `authProvider` field in the user list response
- [ ] 8.2 Update the admin users page (`app/admin/users/page.js`) to display the authentication method badge (Credentials, Google, GitHub, Mixed) for each user

## Task 9: Multi-Tenant OAuth Callback Support

- [ ] 9.1 Verify that the existing dynamic `NEXTAUTH_URL` logic in `[...nextauth]/route.js` works correctly with OAuth callback redirects on custom domains
- [ ] 9.2 Document the OAuth provider configuration note that callback URLs must be registered for each custom domain in the provider's developer console (or use a wildcard approach)

## Task 10: Error Handling and Edge Cases

- [ ] 10.1 Handle the case where an OAuth provider returns no email — reject sign-in with a clear error message
- [ ] 10.2 Handle the `OAuthAccountNotLinked` error scenario (when email matches but provider linking is denied)
- [ ] 10.3 Add appropriate error messages and redirect handling for OAuth failures on the login page

## Task 11: Environment and Documentation

- [ ] 11.1 Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` placeholder entries to `.env.local` and `.env.production` with comments
- [ ] 11.2 Update any README or deployment documentation with OAuth setup instructions (registering callback URLs, obtaining client credentials)
