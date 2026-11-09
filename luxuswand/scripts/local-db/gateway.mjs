// Local stand-in for the Supabase API gateway: forwards /rest/v1/* to PostgREST.
// For tests on this machine only.
import { createServer } from "node:http";

const { API_PORT, REST_URL } = process.env;
if (!API_PORT || !REST_URL) throw new Error("missing API_PORT or REST_URL");

const PREFIX = "/rest/v1";

createServer(async (request, response) => {
  if (!request.url?.startsWith(PREFIX)) {
    response.writeHead(404, { "content-type": "application/json" }).end('{"message":"not found"}');
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  const headers = { ...request.headers };
  delete headers.host;
  delete headers["content-length"];

  try {
    const upstream = await fetch(REST_URL + (request.url.slice(PREFIX.length) || "/"), {
      method: request.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const outgoing = Object.fromEntries(upstream.headers);
    delete outgoing["content-encoding"];
    delete outgoing["transfer-encoding"];
    response.writeHead(upstream.status, outgoing).end(body);
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ message: String(error) }));
  }
}).listen(Number(API_PORT), "127.0.0.1");
