// Script to run Supabase migrations
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function runMigrations() {
  console.log('🚀 Running Supabase migrations...')

  try {
    // Read migration files
    const createTableSql = readFileSync(
      join(__dirname, '../supabase-migrations/create_export_jobs_table.sql'), 
      'utf8'
    )
    
    const createFunctionSql = readFileSync(
      join(__dirname, '../supabase-migrations/create_claim_job_function.sql'), 
      'utf8'
    )

    // Execute migrations
    console.log('📝 Creating export_jobs table...')
    const { error: tableError } = await supabase.rpc('exec_sql', { 
      sql: createTableSql 
    })

    if (tableError) {
      console.error('❌ Failed to create table:', tableError)
      return
    }

    console.log('📝 Creating claim job function...')
    const { error: functionError } = await supabase.rpc('exec_sql', { 
      sql: createFunctionSql 
    })

    if (functionError) {
      console.error('❌ Failed to create function:', functionError)
      return
    }

    console.log('✅ Migrations completed successfully!')

  } catch (error) {
    console.error('💥 Migration failed:', error)
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
}

export { runMigrations }