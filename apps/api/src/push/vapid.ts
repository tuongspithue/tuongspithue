import webpush from 'web-push';

/** Tạo cặp khoá VAPID cho thông báo đẩy: `pnpm --filter @sqt/api vapid`, rồi chép vào .env. */
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:admin@shipquanhtoi.vn`);
