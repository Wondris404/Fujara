# ADR 002 — Do not store music on Vercel

Date: 2026-11-14

Vercel Functions accept about 4.5 MB request or response bodies unless the response is streamed, and `/tmp` is scratch space (documented around 500 MB) that disappears with the instance. See [Vercel Functions limits](https://vercel.com/docs/functions/limitations) (page updated 2026-08-24). Hobby duration max is 300s on that page. Those numbers are plan-dependent and must be rechecked before a production deploy.

Fujara therefore does not upload song bytes to a function. Drive upload, when credentials exist, is intended to go from the client to Google with the user's token. The current callback does not perform that upload.
