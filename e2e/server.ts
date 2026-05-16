import { createServer } from "../src/index";

const server = createServer(3001);
console.log(`E2E server running at ${server.url}`);
