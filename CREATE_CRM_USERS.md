# How to Create CRM Users

The CRM system requires employees to have both:
1. An auth account (created via Supabase Auth)
2. A CRM user record (in the `crm_users` table)

## Steps to Create Your First CRM User

### Option 1: Create Admin User Manually (Recommended for First User)

1. First, create an auth account by signing up on your main application at `/signup`
2. After signing up, note your email address
3. Run this SQL query in Supabase to promote yourself to CRM admin:

```sql
-- Replace 'your-email@example.com' with the email you signed up with
INSERT INTO crm_users (email, full_name, role, level, monthly_salary, auth_user_id)
SELECT
  'your-email@example.com',
  'Admin User',
  'admin',
  'Manager',
  50000,
  id
FROM auth.users
WHERE email = 'your-email@example.com';
```

### Option 2: Create Employee User

After you have an admin, you can create employees by:

1. Having them sign up on the main app
2. Admin runs this SQL to add them to CRM:

```sql
-- Replace values as needed
INSERT INTO crm_users (email, full_name, role, level, monthly_salary, auth_user_id)
SELECT
  'employee@example.com',
  'Employee Name',
  'employee',
  'Junior Executive',
  30000,
  id
FROM auth.users
WHERE email = 'employee@example.com';
```

## Quick Test Users

To create test users for demo:

```sql
-- Create admin test user
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES ('admin@niyom.com', crypt('Admin@123', gen_salt('bf')), now());

INSERT INTO crm_users (email, full_name, role, level, monthly_salary, auth_user_id)
SELECT
  'admin@niyom.com',
  'Test Admin',
  'admin',
  'Manager',
  50000,
  id
FROM auth.users
WHERE email = 'admin@niyom.com';

-- Create employee test user
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES ('employee@niyom.com', crypt('Employee@123', gen_salt('bf')), now());

INSERT INTO crm_users (email, full_name, role, level, monthly_salary, auth_user_id)
SELECT
  'employee@niyom.com',
  'Test Employee',
  'employee',
  'Junior Executive',
  30000,
  id
FROM auth.users
WHERE email = 'employee@niyom.com';
```

## Login

Once users are created:
- Go to `/crm/login`
- Use the email and password you created
- Admin users will be redirected to `/crm/admin`
- Employees will be redirected to `/crm/employee`
