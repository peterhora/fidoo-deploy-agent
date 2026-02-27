import * as authStatus from "./auth-status.js";
import * as authLogin from "./auth-login.js";
import * as authPoll from "./auth-poll.js";
import * as appDeploy from "./app-deploy.js";
import * as appDelete from "./app-delete.js";
import * as appList from "./app-list.js";
import * as appInfo from "./app-info.js";
import * as appUpdateInfo from "./app-update-info.js";
const tools = [
    authStatus,
    authLogin,
    authPoll,
    appDeploy,
    appDelete,
    appList,
    appInfo,
    appUpdateInfo,
];
export const toolRegistry = new Map(tools.map((t) => [t.definition.name, t]));
//# sourceMappingURL=index.js.map