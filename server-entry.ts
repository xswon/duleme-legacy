import { startServer } from "./server";

void startServer()
  .then((server) => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : Number(process.env.PORT) || 4387;
    const host = typeof address === "object" && address ? address.address : "127.0.0.1";
    console.log(`Duleme server running on http://${host}:${port}`);
  })
  .catch((error: unknown) => {
    console.error("Unable to start server", error);
    process.exitCode = 1;
  });
