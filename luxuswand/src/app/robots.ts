import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  // The preview stays out of search engines until the real catalogue is in.
  if (site.sampleMode) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/checkout", "/admin", "/track/", "/api/"] } };
}
