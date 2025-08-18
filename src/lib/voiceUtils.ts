// OpenAI Realtime API utilities for AI Tutor

export const fetchEphemeralKey = async (): Promise<string | null> => {
  try {
    const response = await fetch('/api/realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.client_secret?.value || null;
  } catch (error) {
    console.error('Failed to fetch ephemeral key:', error);
    return null;
  }
};

// Legacy export for backward compatibility
export const getEphemeralKey = fetchEphemeralKey;

// Utility function to create audio element for realtime session
export function createAudioElement(): HTMLAudioElement {
  if (typeof window === 'undefined') {
    throw new Error('Cannot create audio element on server');
  }
  
  const audioElement = document.createElement('audio');
  audioElement.autoplay = true;
  audioElement.style.display = 'none';
  document.body.appendChild(audioElement);
  
  return audioElement;
}

// Clean up audio element
export function destroyAudioElement(audioElement: HTMLAudioElement): void {
  if (audioElement.parentNode) {
    audioElement.parentNode.removeChild(audioElement);
  }
}