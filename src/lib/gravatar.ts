import crypto from 'crypto'

export function getGravatarUrl(email: string, size: number = 200): string {
  // Create MD5 hash of the email
  const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex')
  
  // Return Gravatar URL
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon&r=pg`
}

export function getGravatarProfileUrl(email: string): string {
  const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex')
  return `https://www.gravatar.com/${hash}.json`
}

export async function checkGravatarExists(email: string): Promise<boolean> {
  try {
    const profileUrl = getGravatarProfileUrl(email)
    const response = await fetch(profileUrl)
    return response.ok
  } catch (error) {
    return false
  }
}
