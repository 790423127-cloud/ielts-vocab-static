One Click Publish Cache Version

Use after installing the replacement package:
vocab-one-click-publish-cache-replacement.zip

What this solves:
The old script used GET /api/export-static, but the old API only accepted POST, so it returned 405.
The new replacement package adds:
1. /api/export-cache
2. GET /api/export-static
3. Browser auto-saves words to server cache.

First install:
1. Replace app and scripts from vocab-one-click-publish-cache-replacement.zip
2. Delete .next
3. Start local site once
4. Open http://localhost:3000 once and wait 3 seconds

Then:
1. Run setup-tcb.cmd once if tcb is not installed
2. Run publish-tencent.cmd every time you want to deploy

publish-tencent.cmd will:
1. Start local site if needed
2. Check export cache
3. Export static-site.zip
4. Extract it
5. Deploy directly to Tencent CloudBase

Default URL:
https://ielts-vocab-d1gymoilc5746f67a-1441466606.tcloudbaseapp.com/beidanci/
