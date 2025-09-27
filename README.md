# HTMLChat 💬
[![GitHub Pages Build](https://github.com/HTMLToolkit/HTMLChat/actions/workflows/static.yml/badge.svg)](https://github.com/HTMLToolkit/HTMLChat/actions/workflows/static.yml) [![All Contributors](https://img.shields.io/github/all-contributors/HTMLToolkit/HTMLChat?color=ee8449&style=flat-square)](#contributors)


A retro-styled, browser-only chat client.  
Version: **v0.2.0-beta**

## What this is  

HTMLChat is a super simple chat system I hacked together:  

* Frontend is plain HTML/CSS/JS built with Vite (retro style, scrollbars included).  
* Backend is a tiny API (yes, it’s alive, and yes, it works).  
* LocalStorage keeps your name + cached messages.  
* No cookies. No nonsense. Just **chat**.  
  
## Features
  
- Multiple rooms (#general, #random, #offtopic, #computers)
- Nicknames + color-coding
- Connection status + heartbeat (so you look online)
- Export chat logs as JSON (plus a handy Reload button next to Export)
- File uploads (images/docs) with previews
- Replies (click to reply, threaded context)
- Search (fast, non-blocking)
- Moderator tools (delete/ban)
- Settings modal (desktop notifications + sounds toggles)
- Lucide icons via npm (no CDN, crisp SVGs)
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
  
- Frontend lives in `Build/` and uses Vite.  
	- Dev: `cd Build && npm install && npm run dev`  
	- Build: `cd Build && npm install && npm run build`  
- Backend is currently deployed at:  
```
https://htmlchat.neeljaiswal23.workers.dev
```  
The source for it is at `Worker/`!
You can swap `baseURL` in the JS if you want to host your own.

## License

MIT, because why not.

## Contributing

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## Star History

<a href="https://www.star-history.com/#HTMLToolkit/HTMLChat&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=HTMLToolkit/HTMLChat&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=HTMLToolkit/HTMLChat&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=HTMLToolkit/HTMLChat&type=Date" />
 </picture>
</a>
