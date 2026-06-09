/*
  # Create Employees Table for CRM Authentication

  1. New Tables
    - `employees`
      - `id` (uuid, primary key) - matches auth.users.id
      - `name` (text) - employee full name
      - `email` (text, unique) - employee email
      - `role` (text) - either 'admin' or 'employee'
      - `salary` (numeric) - employee salary
      - `created_at` (timestamptz) - creation timestamp

  2. Security
    - Enable RLS on `employees` table
    - Admin users can view and manage all employees
    - Employees can only view their own record
    - Only admins can insert new employees
    - Only admins can update employee records

  3. Important Notes
    - Employee id MUST match auth.users.id for authentication flow
    - Role values are restricted to 'admin' or 'employee'
    - Email uniqueness is enforced
    - Default timestamp for record tracking
*/

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'employee')),
  salary numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all employees
CREATE POLICY "Admins can view all employees"
  ON employees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.id = auth.uid()
      AND employees.role = 'admin'
    )
  );

-- Policy: Employees can view only their own record
CREATE POLICY "Employees can view own record"
  ON employees
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy: Only admins can insert employees
CREATE POLICY "Only admins can insert employees"
  ON employees
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.id = auth.uid()
      AND employees.role = 'admin'
    )
  );

-- Policy: Only admins can update employees
CREATE POLICY "Only admins can update employees"
  ON employees
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.id = auth.uid()
      AND employees.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.id = auth.uid()
      AND employees.role = 'admin'
    )
  );

-- Policy: Only admins can delete employees
CREATE POLICY "Only admins can delete employees"
  ON employees
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.id = auth.uid()
      AND employees.role = 'admin'
    )
  );

-- Create index for faster role-based queries
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);