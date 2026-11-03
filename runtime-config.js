'use strict';

// Browser-safe configuration only. A connected deployment replaces apiBaseUrl
// with its HTTPS API root including /api. Payment keys, webhook secrets, staff credentials,
// and database URLs belong only in the backend secret store.
window.WEINBERGERS_RUNTIME = Object.freeze({apiBaseUrl: ''});
