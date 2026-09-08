// The Supabase project's address, in the one shape every caller can build on.
//
// WHY THIS IS NOT `.trim()`. One variable feeds both halves of this app, and
// until now only the browser normalized it: `services/supabaseClient.ts` takes
// `new URL(value).origin`, so a value carrying a path — and
// `https://<ref>.supabase.co/auth/v1` is the path people write, because it is
// the address they were reading when they filled the box — works there,
// silently and completely.
//
// The server kept the path and appended its own. It went looking for
// `/auth/v1/auth/v1/.well-known/jwks.json`, got a 404, and refused every token
// with "the signing keys could not be read" — which reads as a session problem
// and is not one. A variable that is right in the browser and wrong in the
// function, with nothing on either side willing to say so.
//
// So both sides normalize the same way now. A value that is not a URL at all is
// handed back trimmed rather than emptied: the callers' own "must be set"
// checks are what should speak for it, and swallowing it here would turn a
// typo into a missing variable.
export function supabaseOrigin(value: string): string {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}
