import ChatRoom from './chatRoom.js';

export { ChatRoom };  // Export Durable Object class

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response('', {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Chat room endpoints
    const roomMatch = pathname.match(/^\/chat\/([\w-]+)$/);
    if (roomMatch) {
      const roomId = roomMatch[1];
      const id = env.CHAT_ROOM.idFromName(roomId);
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }

    // Private message endpoints
    const pmMatch = pathname.match(/^\/pm\/([\w-]+)$/);
    if (pmMatch) {
      const conversationId = pmMatch[1];
      const id = env.CHAT_ROOM.idFromName(`pm_${conversationId}`);
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }

    // File upload endpoint
    if (pathname === '/upload') {
      return handleFileUpload(request, env);
    }

    // File serving endpoint
    const fileMatch = pathname.match(/^\/files\/([\w.-]+)$/);
    if (fileMatch && env.FILE_BUCKET) {
      const filename = fileMatch[1];
      const object = await env.FILE_BUCKET.get(filename);
      
      if (!object) {
        return new Response('File not found', { status: 404 });
      }

      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000' // 1 year cache
        }
      });
    }

    // Moderation endpoints
    const modMatch = pathname.match(/^\/mod\/([\w-]+)$/);
    if (modMatch) {
      const roomId = modMatch[1];
      const id = env.CHAT_ROOM.idFromName(roomId);
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }

    // Health check endpoint
    if (pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response("Not found", { 
      status: 404,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

// File upload handler
async function handleFileUpload(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const user = formData.get('user');
    const room = formData.get('room');

    if (!file || !user || !room) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: file, user, room'
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({
        error: 'File too large. Maximum size is 5MB.'
      }), { 
        status: 413,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'application/pdf', 'text/plain',
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({
        error: `File type ${file.type} is not allowed`
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${user}_${sanitizedName}`;
    
    // Store file in R2 bucket (if available) or convert to base64
    let fileUrl;
    let storedSuccessfully = false;
    
    if (env.FILE_BUCKET) {
      try {
        await env.FILE_BUCKET.put(filename, file.stream(), {
          httpMetadata: {
            contentType: file.type
          },
          customMetadata: {
            uploadedBy: user,
            uploadedAt: new Date().toISOString(),
            originalName: file.name
          }
        });
        fileUrl = `/files/${filename}`;
        storedSuccessfully = true;
      } catch (error) {
        console.error('R2 upload failed:', error);
      }
    }
    
    if (!storedSuccessfully) {
      // Fallback: convert to base64 data URL
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      fileUrl = `data:${file.type};base64,${base64}`;
    }

    return new Response(JSON.stringify({
      success: true,
      filename: filename,
      url: fileUrl,
      size: file.size,
      type: file.type,
      originalName: file.name,
      uploadedBy: user,
      uploadedAt: new Date().toISOString()
    }), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({
      error: 'Upload failed: ' + error.message
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}