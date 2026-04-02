exports.up = async function (knex) {
  await knex.schema.createTable('companies', t => {
    t.increments('id').primary()
    t.string('name').notNullable()
    t.string('created_at')
  })

  await knex.schema.createTable('users', t => {
    t.increments('id').primary()
    t.integer('company_id').notNullable().references('id').inTable('companies')
    t.string('name').notNullable()
    t.string('email').notNullable().unique()
    t.string('password_hash').notNullable()
    t.string('role').defaultTo('admin') // admin | superadmin
    t.string('created_at')
  })

  // Add company_id to all tenant tables
  for (const table of ['media', 'playlists', 'tickers', 'screens', 'schedules']) {
    await knex.schema.alterTable(table, t => {
      t.integer('company_id')
    })
  }
}

exports.down = async function (knex) {
  for (const table of ['media', 'playlists', 'tickers', 'screens', 'schedules']) {
    await knex.schema.alterTable(table, t => {
      t.dropColumn('company_id')
    })
  }
  await knex.schema.dropTableIfExists('users')
  await knex.schema.dropTableIfExists('companies')
}
