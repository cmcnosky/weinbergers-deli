'use strict';

// Browser-safe service addresses only. A static public site may point owner and
// published-content traffic at a separate HTTPS API without enabling checkout.
// Payment keys, password hashes, webhook secrets, staff credentials, and
// database URLs belong only in the backend secret store.
window.WEINBERGERS_RUNTIME = Object.freeze({
  apiBaseUrl: '',
  ownerApiBaseUrl: 'https://weinbergers-deli.cmcnosky.chatgpt.site/api',
  contentApiBaseUrl: 'https://weinbergers-deli.cmcnosky.chatgpt.site/api'
});
