// FIX: use fully qualified C++ types (std::string, std::vector) so the starter code
// compiles without `using namespace std;` in user code.
// FIX: added 2D array cases (int[][], string[][]) — previously fell through to
// `default`, which for C++ returned the literal string 'auto' as a parameter type.
// `auto` is not valid as a plain function parameter type in C++, so any problem
// with a 2D array param (e.g. `edges: int[][]`) failed to compile immediately,
// regardless of what the actual test cases or user code looked like.
export function cppType(type: string): string {
  switch (type) {
    case 'string':     return 'std::string';
    case 'int':        return 'int';
    case 'long':        return 'long long';
    case 'double':       return 'double';
    case 'bool':        return 'bool';
    case 'int[]':       return 'std::vector<int>';
    case 'long[]':       return 'std::vector<long long>';
    case 'double[]':     return 'std::vector<double>';
    case 'string[]':    return 'std::vector<std::string>';
    case 'bool[]':      return 'std::vector<bool>';
    case 'int[][]':     return 'std::vector<std::vector<int>>';
    case 'long[][]':     return 'std::vector<std::vector<long long>>';
    case 'string[][]':  return 'std::vector<std::vector<std::string>>';
    default:            return 'std::vector<int>'; // safer than 'auto' — never a valid param type on its own
  }
}

export function javaType(type: string): string {
  switch (type) {
    case 'string':     return 'String';
    case 'int':        return 'int';
    case 'long':        return 'long';
    case 'double':       return 'double';
    case 'bool':        return 'boolean';
    case 'int[]':       return 'int[]';
    case 'long[]':       return 'long[]';
    case 'double[]':     return 'double[]';
    case 'string[]':    return 'String[]';
    case 'bool[]':      return 'boolean[]';
    case 'int[][]':     return 'int[][]';
    case 'long[][]':     return 'long[][]';
    case 'string[][]':  return 'String[][]';
    default:            return 'Object';
  }
}

export function goType(type: string): string {
  switch (type) {
    case 'string':     return 'string';
    case 'int':        return 'int';
    case 'long':        return 'int64';
    case 'double':       return 'float64';
    case 'bool':        return 'bool';
    case 'int[]':       return '[]int';
    case 'long[]':       return '[]int64';
    case 'double[]':     return '[]float64';
    case 'string[]':    return '[]string';
    case 'bool[]':      return '[]bool';
    case 'int[][]':     return '[][]int';
    case 'long[][]':     return '[][]int64';
    case 'string[][]':  return '[][]string';
    default:            return 'interface{}';
  }
}

export function rustType(type: string): string {
  switch (type) {
    case 'string':     return 'String';
    case 'int':        return 'i32';
    case 'long':        return 'i64';
    case 'double':       return 'f64';
    case 'bool':        return 'bool';
    case 'int[]':       return 'Vec<i32>';
    case 'long[]':       return 'Vec<i64>';
    case 'double[]':     return 'Vec<f64>';
    case 'string[]':    return 'Vec<String>';
    case 'bool[]':      return 'Vec<bool>';
    case 'int[][]':     return 'Vec<Vec<i32>>';
    case 'long[][]':     return 'Vec<Vec<i64>>';
    case 'string[][]':  return 'Vec<Vec<String>>';
    default:            return 'i32';
  }
}