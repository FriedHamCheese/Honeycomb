function sizedTypeToSQLType(typename){
  /*
  input:
    type[size] string representing type and its size in bits.
    Such as int[32] yields INT(32), float[16] yields FLOAT(16), etc...
    
  Exceptions: no documented exceptions.
  
  Returns either:
  - {sqltype: str} where sqltype is SQLTYPE(size) and is equivalent to ctype[size] 
  - {error: str} for errors
  */
  
  const typeSizeSpecifierStart = "[";
  const typeSizeSpecifierStartIndex = typename.indexOf(typeSizeSpecifierStart);
  if(typeSizeSpecifierStartIndex === -1)
    return {error: `invalid type ${typename}.`};
  
  const INCLUDING_FIRST_CHARACTER = 0;
  const onlyTypeName = typename.substring(INCLUDING_FIRST_CHARACTER, typeSizeSpecifierStartIndex);
  const typesWithSizeToSQLTypes = {
    "int": "INT",
    "str": "VARCHAR",
    "float": "FLOAT",
    "char": "CHAR",
  };
  
  const bitCountBoundaries = {
    "INT": {min: 1, max: 64},
    "VARCHAR": {min: 1, max: Number.MAX_VALUE},
    "FLOAT": {min: 0, max: 53},
    "CHAR": {min: 1, max: Number.MAX_VALUE}
  }
  
  const sqlType = typesWithSizeToSQLTypes[onlyTypeName];
  if(!sqlType)
    return {error: `invalid type ${typename}.`}
  
  const typeSizeSpecifierEnd = "]";
  const typeSizeSpecifierEndIndex = typename.indexOf(typeSizeSpecifierEnd, typeSizeSpecifierStartIndex+1);
  if(typeSizeSpecifierEndIndex === -1)
    return {error: `unclosed size bracket in ${typename}.`}
  
  const typeSizeStr = typename.substring(typeSizeSpecifierStartIndex+1, typeSizeSpecifierEndIndex);
  const typeSize = Number.parseInt(typeSizeStr);
  if(Number.isNaN(typeSize))
    return {error: `invalid size specified in ${typename}.`};
  const bitCountBoundary = bitCountBoundaries[sqlType];
  if(typeSize < bitCountBoundary.min || typeSize > bitCountBoundary.max)
    return {error: `invalid size specified in ${typename} Allowed range: [${bitCountBoundary.min}-${bitCountBoundary.max}].`}; 
  
  return {sqltype: `${sqlType}(${typeSizeStr})`}
}


export function parseBodyToSQLTableAttributes(objectFromBody, minColumnNameCharacters, maxColumnNameCharacters){
  let warnings = "";
  let sqlTableAttributes = "";
  const INCLUDING_FIRST_CHARACTER = 0;
  const MAX_TYPE_CHARACTERS = 16;

  for(const [columnName, typeName] of Object.entries(objectFromBody))
  {
    if((typeof typeName) !== "string"){
      warnings = warnings.concat(`Type of ${columnName} is not string type.\n`);
      continue;
    }
    
    const sanitisedColumnName = columnName.trim();
    if(sanitisedColumnName.length < minColumnNameCharacters || sanitisedColumnName.length > maxColumnNameCharacters){
      warnings = warnings.concat(`Sanitised column ${sanitisedColumnName} is ignored due to its length not being ${MIN_COLUMN_NAME_CHARACTERS}-${MAX_COLUMN_NAME_CHARACTERS}.\n`);
      continue;
    }

    const sanitisedTypeName = typeName.substring(INCLUDING_FIRST_CHARACTER, MAX_TYPE_CHARACTERS).trim();
    let typeFound = true;
    switch(sanitisedTypeName){
      case "float":
        sqlTableAttributes = sqlTableAttributes.concat(`${sanitisedColumnName} FLOAT(24),`);
        break;
      case "char":
        sqlTableAttributes = sqlTableAttributes.concat(`${sanitisedColumnName} CHAR,`);
        break;
      default: 
        typeFound = false;
    }
    
    if(!typeFound){
      const sizedSQLType = sizedTypeToSQLType(sanitisedTypeName);
      if(!sizedSQLType.sqltype){
        warnings = warnings.concat(`${sanitisedColumnName} ignored due to ${sizedSQLType.error}\n`);
        continue;
      }
      sqlTableAttributes = sqlTableAttributes.concat(`${sanitisedColumnName} ${sizedSQLType.sqltype},`);
    }
  }
  return {
    sqlTableAttributes: sqlTableAttributes.substring(0, sqlTableAttributes.length - ','.length),
    warnings: warnings,
  };
}