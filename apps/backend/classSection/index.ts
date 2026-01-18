import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { ClassSectionProxy } from "../src/controllers/classSection";

export async function classSection(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Wrap Express controller for Azure Function
  const mockRes = {
    status: (code: number) => ({
      json: (data: unknown) => {
        return {
          status: code,
          headers: { "Content-Type": "application/json" },
          jsonBody: data,
        };
      },
      send: (data: unknown) => {
        return {
          status: code,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        };
      },
    }),
    json: (data: unknown) => {
      return {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "max-age=300",
        },
        jsonBody: data,
      };
    },
    setHeader: (key: string, value: string) => {
      // Headers are set in the json/send methods above
    },
  };

  try {
    const params = new URLSearchParams(request.url.split("?")[1] || "");
    const queryObj: Record<string, string> = {};
    params.forEach((value, key) => {
      queryObj[key] = value;
    });

    let result: HttpResponseInit = {
      status: 500,
      body: "Internal Server Error",
    };

    await ClassSectionProxy(
      { query: queryObj } as any,
      {
        ...mockRes,
        status: (code: number) => {
          const statusObj = mockRes.status(code);
          return {
            ...statusObj,
            json: (data: unknown) => {
              result = statusObj.json(data);
              return result;
            },
            send: (data: unknown) => {
              result = statusObj.send(data);
              return result;
            },
          };
        },
        json: (data: unknown) => {
          result = mockRes.json(data);
          return result;
        },
      } as any
    );

    return result;
  } catch (error) {
    context.error(`Error in classSection function: ${error}`);
    return {
      status: 500,
      jsonBody: { error: "Internal Server Error" },
    };
  }
}

app.http("classSection", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: classSection,
});
