import ChatRoom from './chatRoom.js';

export { ChatRoom };  // Export Durable Object class

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const match = pathname.match(/^\/chat\/([\w-]+)$/);
    if (!match) return new Response("Not found", { status: 404 });

    const roomId = match[1];
    const id = env.CHAT_ROOM.idFromName(roomId);
    const stub = env.CHAT_ROOM.get(id);

    return stub.fetch(request);
  }
};
