const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function makeToken(len = 8) {
  return Array.from({ length: len }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
}

exports.up = async function (knex) {
  await knex.schema.table('companies', table => {
    table.string('pairing_token').nullable()
  })
  // Generate tokens for existing companies
  const companies = await knex('companies').select('id')
  for (const c of companies) {
    await knex('companies').where({ id: c.id }).update({ pairing_token: makeToken() })
  }
}

exports.down = async function (knex) {
  await knex.schema.table('companies', table => {
    table.dropColumn('pairing_token')
  })
}
