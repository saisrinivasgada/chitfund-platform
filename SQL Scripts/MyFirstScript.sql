use chitfund_user;

select * from users;

use chitfund_member;

select * from tenants;

select * from member_user_links;

select * from members;

select * from phone_otps order by created_at desc;

 use chitfund_chit;
UPDATE chit_enrollments
SET active = 1
WHERE chit_id = '6699e552-bed9-44ef-8425-1b4e8c470f94'
  AND active = 0;


UPDATE users SET password_hash='\$2b\$12\$kHt/wbz9HxUa9D9XZMt0zu1eX9QBDk6VzG6tar3zPsoGIhDjyvxzu', temp_password_hash=NULL, must_change_password=0 WHERE      
  username='kittu';
  
  beddad75-6c57-448e-82ef-0542b44e3429
  b97dd2d9-6313-4c62-add0-cc9456f46222
  10000000-0000-0000-0000-000000000001
  
  
  