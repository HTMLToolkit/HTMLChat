# HTMLChat 💬

A retro-styled, browser-only chat client.  
Version: **v0.1.0-beta**

## What this is  

HTMLChat is a super simple chat system I hacked together:  

* Frontend is pure HTML/CSS/JS (retro style, scrollbars included).  
* Backend is a tiny API (yes, it’s alive, and yes, it works).  
* LocalStorage keeps your name + cached messages.  
* No cookies. No nonsense. Just **chat**.  
  
## Features
  
- Multiple rooms (#general, #random, #offtopic, #computers)
- Nicknames + color-coding
- Connection status + heartbeat (so you look online)
- Export chat logs as JSON
- Mobile-friendly (user list hides on small screens)
- Retro scrollbars (obviously)  
  
## Roadmap  
  
This is **beta**, so expect bugs and jank. Stuff I *might* add:  
  
* Dark mode  
* `/commands` (like `/me` or `/shrug`)  
* Typing indicators  
* WebSocket support (currently polling)  
* Emojis, maybe (but only if they don’t ruin the retro feel)  
  
## Running it  
  
- Frontend is just static HTML.
- Backend is currently deployed at:  
```
https://htmlchat.neeljaiswal23.workers.dev
```  
The source for it is at `Worker/`.

You can swap `baseURL` in the JS if you want to host your own.

## License

MIT, because why not.
