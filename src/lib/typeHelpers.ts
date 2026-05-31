// FIX: use fully qualified C++ types (std::string, std::vector) so the starter code
// compiles without `using namespace std;` in user code.
export function cppType(type: string): string {
  switch (type) {
    case 'string':   return 'std::string';
    case 'int':      return 'int';
    case 'bool':     return 'bool';
    case 'int[]':    return 'std::vector<int>';
    case 'string[]': return 'std::vector<std::string>';
    default:         return 'auto';
  }
}

export function javaType(type: string): string {
  switch (type) {
    case 'string':   return 'String';
    case 'int':      return 'int';
    case 'bool':     return 'boolean';
    case 'int[]':    return 'int[]';
    case 'string[]': return 'String[]';
    default:         return 'Object';
  }
}

export function goType(type: string): string {
  switch (type) {
    case 'string':   return 'string';
    case 'int':      return 'int';
    case 'bool':     return 'bool';
    case 'int[]':    return '[]int';
    case 'string[]': return '[]string';
    default:         return 'interface{}';
  }
}

export function rustType(type: string): string {
  switch (type) {
    case 'string':   return 'String';
    case 'int':      return 'i32';
    case 'bool':     return 'bool';
    case 'int[]':    return 'Vec<i32>';
    case 'string[]': return 'Vec<String>';
    default:         return 'i32';
  }
}
