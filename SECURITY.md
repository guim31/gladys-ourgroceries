# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the OurGroceries email and password are stored by Gladys in
  the integration configuration (the password is a `secret` field, never sent
  back to the browser). The container reads them at startup and never writes
  them anywhere.
- **`/data`**: the only file is `session.json`, written `0600`: the
  OurGroceries session cookie, the team identifier, and a hash of the email to
  tell accounts apart. The cookie gives access to the shopping lists: treat a
  copy of the volume as a credential.
- **Logs**: neither the password, nor the email, nor the session cookie is
  ever logged, at any level (checked by `test/logs.test.js`).
- **Network**: outbound HTTPS to `www.ourgroceries.com` only. The container
  listens on no port.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the OurGroceries service.
