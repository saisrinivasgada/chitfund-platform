// Read only display hints from the browser credential. The backend validates the ID token.
export function googleProfileHint(idToken) {
  const encoded = idToken?.split('.')[1];
  if (!encoded) throw new Error('Google did not return a usable account. Please try again.');
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    if (!claims.email) throw new Error('No email');
    return { email: claims.email, name: claims.name ?? '' };
  } catch {
    throw new Error('Google did not return an email address. Please try another account.');
  }
}
