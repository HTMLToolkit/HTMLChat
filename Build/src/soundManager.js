export class SoundManager {
  constructor() {
    this.soundsEnabled = this.loadSetting('sounds_enabled', true);
    this.volume = this.loadSetting('volume', 0.5);
    
    this.sounds = {
      message: document.getElementById('sound-message'),
      pm: document.getElementById('sound-pm'), 
      join: document.getElementById('sound-join')
    };
    
    // Set initial volumes
    Object.values(this.sounds).forEach(audio => {
      if (audio) audio.volume = this.volume;
    });
  }
  
  loadSetting(key, defaultValue) {
    try {
      const saved = localStorage.getItem(`htmlchat_${key}`);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch(e) {
      return defaultValue;
    }
  }
  
  saveSetting(key, value) {
    try {
      localStorage.setItem(`htmlchat_${key}`, JSON.stringify(value));
    } catch(e) {
      console.warn('Failed to save sound setting:', e);
    }
  }
  
  playSound(type) {
    if (!this.soundsEnabled || !this.sounds[type]) return;
    
    try {
      const audio = this.sounds[type];
      audio.currentTime = 0;
      audio.play().catch(e => {
        // Ignore play errors (usually due to user interaction requirements)
        console.debug('Sound play failed:', e);
      });
    } catch(e) {
      console.warn('Sound error:', e);
    }
  }
  
  toggleSounds() {
    this.soundsEnabled = !this.soundsEnabled;
    this.saveSetting('sounds_enabled', this.soundsEnabled);
    return this.soundsEnabled;
  }
  
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.saveSetting('volume', this.volume);
    
    Object.values(this.sounds).forEach(audio => {
      if (audio) audio.volume = this.volume;
    });
  }
  
  isSoundEnabled() {
    return this.soundsEnabled;
  }
}