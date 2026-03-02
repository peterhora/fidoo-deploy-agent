export function generateLoginHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Signing in\u2026</title>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'">
</head>
<body>
  <script>
    (function () {
      var ORIGIN = location.origin;
      var destination = "/";
      try {
        var ref = document.referrer;
        if (ref) {
          var refUrl = new URL(ref);
          if (refUrl.origin === ORIGIN) {
            var path = refUrl.pathname + refUrl.search + refUrl.hash;
            if (!path.startsWith("/login")) {
              destination = path;
            }
          }
        }
      } catch (e) {}
      location.replace("/.auth/login/aad?post_login_redirect_uri=" + encodeURIComponent(destination));
    })();
  <\/script>
  <noscript><p>JavaScript is required to sign in.</p></noscript>
</body>
</html>`;
}
//# sourceMappingURL=login.js.map