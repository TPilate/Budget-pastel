import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const email = process.env.SEED_USER_EMAIL
const password = process.env.SEED_USER_PASSWORD
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !password) {
  throw new Error('SEED_USER_EMAIL and SEED_USER_PASSWORD must be set')
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    throw listError
  }

  const alreadyExists = existing.users.some((user) => user.email === email)

  if (alreadyExists) {
    console.log(`User ${email} already exists, skipping.`)
    return
  }

  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    throw createError
  }

  console.log(`Created user ${email}.`)
}

main()
