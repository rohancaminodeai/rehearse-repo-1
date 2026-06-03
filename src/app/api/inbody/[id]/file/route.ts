import { NextResponse } from "next/server";

import { getCustomerSession, getTrainerSession } from "@/server/auth/session";
import { getEntryForViewer } from "@/server/domain/inbody";
import { getObjectStream } from "@/server/lib/s3";
import { toApiError } from "@/server/lib/errors";

type RouteContext = { params: Promise<{ id: string }> };

/** Strip quotes/newlines so a filename is safe inside a Content-Disposition header. */
function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, "");
}

/**
 * Adapt the S3 lib's body (a Node `Readable` in the Node runtime, or a web
 * `ReadableStream`) to the DOM `ReadableStream` that `Response` accepts under
 * the `dom` lib. The AWS SDK returns a Node `Readable`; for the web-stream case
 * the value already satisfies `BodyInit`, so it is returned as-is. No casts.
 */
function toResponseBody(body: ReadableStream | NodeJS.ReadableStream): ReadableStream {
  // A web ReadableStream exposes `getReader`; if present, it is already valid.
  if ("getReader" in body) {
    return body;
  }
  const nodeStream = body;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      if ("destroy" in nodeStream && typeof nodeStream.destroy === "function") {
        nodeStream.destroy();
      }
    },
  });
}

/**
 * GET /api/inbody/[id]/file — stream the stored image through the auth-checked
 * proxy (CLAUDE.md rule 4: images are NEVER served via a public/presigned URL).
 *
 * Both session cookies are read and handed to the domain, which authorizes by
 * role: a trainer must own the entry's customer; a customer must own the entry.
 * `?download=1` forces an attachment download with the original filename.
 */
export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  try {
    const { id } = await ctx.params;

    const [trainerSession, customerSession] = await Promise.all([
      getTrainerSession(),
      getCustomerSession(),
    ]);

    const { objectKey, contentType, originalFilename } = await getEntryForViewer(
      { trainerSession, customerSession },
      id,
    );

    const { body, contentType: storedContentType } = await getObjectStream(objectKey);

    const webBody = toResponseBody(body);

    const headers = new Headers();
    headers.set("Content-Type", contentType || storedContentType || "application/octet-stream");

    const url = new URL(req.url);
    if (url.searchParams.get("download") === "1") {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${sanitizeFilename(originalFilename)}"`,
      );
    }

    return new Response(webBody, { status: 200, headers });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
