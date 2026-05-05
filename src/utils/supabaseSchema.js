export const getSupabaseErrorText = (error) => {
  const message = String(error?.message || '')
  const details = String(error?.details || '')
  const hint = String(error?.hint || '')
  return `${message} ${details} ${hint}`.toLowerCase()
}

export const isMissingSchemaColumnError = (error, columnName) => {
  const code = String(error?.code || '')
  const combinedText = getSupabaseErrorText(error)
  const normalizedColumnName = String(columnName || '').toLowerCase()

  return (
    combinedText.includes(normalizedColumnName) &&
    (code === 'PGRST204' ||
      code === '42703' ||
      combinedText.includes('column') ||
      combinedText.includes('schema cache'))
  )
}

export const withSchemaColumnFallback = async ({
  payload,
  execute,
  requiredColumns = [],
}) => {
  const currentPayload = { ...payload }
  const omittedColumns = []
  const requiredColumnSet = new Set(requiredColumns)

  while (true) {
    if (Object.keys(currentPayload).length === 0) {
      return {
        data: null,
        error: null,
        appliedPayload: {},
        omittedColumns,
      }
    }

    const response = await execute(currentPayload)

    if (!response?.error) {
      return {
        ...response,
        appliedPayload: { ...currentPayload },
        omittedColumns,
      }
    }

    const missingColumn = Object.keys(currentPayload).find(
      (columnName) =>
        !requiredColumnSet.has(columnName) && isMissingSchemaColumnError(response.error, columnName),
    )

    if (!missingColumn) {
      return {
        ...response,
        appliedPayload: { ...currentPayload },
        omittedColumns,
      }
    }

    omittedColumns.push(missingColumn)
    delete currentPayload[missingColumn]
  }
}
