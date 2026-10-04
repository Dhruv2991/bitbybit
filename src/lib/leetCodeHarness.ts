// ════════════════════════════════════════════════════════════════════════════════════
// src/lib/leetCodeHarness.ts
//
// Universal LeetCode-Style Execution Harness & Driver Generator
// Supporting: Java, C++, Go, Rust, Python, JavaScript
//
// Provides:
// 1. Signature & Type Inspector (identifies params, ListNode, TreeNode, Node, return types)
// 2. Comprehensive Built-In Data Structure Library (ListNode, TreeNode, Node)
// 3. Dynamic Driver Generation (Main/main wrappers with JSON serialization)
// 4. Integrated Execution Tracing Support (__BB_TRACE__)
// ════════════════════════════════════════════════════════════════════════════════════

export type SupportedLang = 'python' | 'javascript' | 'cpp' | 'java' | 'go' | 'rust';

export interface ParamInfo {
  name: string;
  rawType: string;
  kind: 'primitive' | 'array' | '2d-array' | 'listnode' | 'treenode' | 'graphnode' | 'object' | 'unknown';
}

export interface FunctionSignature {
  name: string;
  params: ParamInfo[];
  returnType: string;
  isVoid: boolean;
}

// ── 1. Signature & Type Inspector ────────────────────────────────────────────────

export function inspectSignature(code: string, lang: SupportedLang): FunctionSignature {
  switch (lang) {
    case 'java': {
      const m = code.match(/(?:public|private|protected|static|\s)+([\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)/);
      if (!m) return { name: 'solution', params: [], returnType: 'void', isVoid: false };
      const returnType = m[1].trim();
      const name = m[2].trim();
      const params = parseJavaParams(m[3]);
      return { name, params, returnType, isVoid: returnType === 'void' };
    }

    case 'cpp': {
      const lines = code.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('#'));
      for (const line of lines) {
        const m = line.match(/\b(?:\w+::)?([\w<>:*&\s]+)\s+(\w+)\s*\(([^)]*)\)\s*\{/);
        if (m && !['main', 'if', 'for', 'while', 'switch'].includes(m[2])) {
          const returnType = m[1].trim();
          const name = m[2].trim();
          const params = parseCppParams(m[3]);
          return { name, params, returnType, isVoid: returnType === 'void' };
        }
      }
      return { name: 'solution', params: [], returnType: 'void', isVoid: false };
    }

    case 'go': {
      const m = code.match(/func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(([^)]*)\)\s*([^{]*)/);
      if (!m) return { name: 'solution', params: [], returnType: 'void', isVoid: false };
      const name = m[1].trim();
      const params = parseGoParams(m[2]);
      const returnType = m[3].trim();
      return { name, params, returnType, isVoid: returnType === '' };
    }

    case 'rust': {
      const m = code.match(/fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?:->\s*([^{]+))?/);
      if (!m) return { name: 'solution', params: [], returnType: 'void', isVoid: false };
      const name = m[1].trim();
      const params = parseRustParams(m[2]);
      const returnType = (m[3] || '').trim();
      return { name, params, returnType, isVoid: returnType === '' || returnType === '()' };
    }

    case 'python': {
      const m = code.match(/def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
      if (!m) return { name: 'solution', params: [], returnType: 'None', isVoid: false };
      const name = m[1].trim();
      const rawParams = m[2].split(',').map(p => p.trim()).filter(p => p && p !== 'self');
      const params: ParamInfo[] = rawParams.map(p => {
        const [pName, pType = ''] = p.split(':').map(x => x.trim());
        return { name: pName, rawType: pType, kind: classifyType(pType) };
      });
      return { name, params, returnType: (m[3] || 'None').trim(), isVoid: m[3]?.trim() === 'None' };
    }

    case 'javascript': {
      const m = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))\s*\(([^)]*)\)/);
      const name = m ? m[1] || m[2] : 'solution';
      const rawParams = m && m[3] ? m[3].split(',').map(p => p.trim()).filter(Boolean) : [];
      const params: ParamInfo[] = rawParams.map(p => ({ name: p, rawType: 'any', kind: 'unknown' }));
      return { name, params, returnType: 'any', isVoid: false };
    }
  }
}

function classifyType(t: string): ParamInfo['kind'] {
  const s = t.toLowerCase();
  if (s.includes('listnode')) return 'listnode';
  if (s.includes('treenode')) return 'treenode';
  if (s.includes('node')) return 'graphnode';
  if (s.includes('[][]') || s.includes('vector<vector') || s.includes('vec<vec')) return '2d-array';
  if (s.includes('[]') || s.includes('vector<') || s.includes('vec<') || s.includes('list<')) return 'array';
  if (['int', 'long', 'double', 'float', 'bool', 'boolean', 'string', 'char', 'i32', 'i64', 'f64'].includes(s)) {
    return 'primitive';
  }
  return 'unknown';
}

function parseJavaParams(paramStr: string): ParamInfo[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(',').map(part => {
    const tokens = part.trim().split(/\s+/);
    const name = tokens.pop() || '';
    const rawType = tokens.join(' ');
    return { name, rawType, kind: classifyType(rawType) };
  });
}

function parseCppParams(paramStr: string): ParamInfo[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(',').map(part => {
    const tokens = part.trim().replace(/&|\*/g, '').split(/\s+/);
    const name = tokens.pop() || '';
    const rawType = tokens.join(' ');
    return { name, rawType, kind: classifyType(rawType) };
  });
}

function parseGoParams(paramStr: string): ParamInfo[] {
  if (!paramStr.trim()) return [];
  return paramStr.split(',').map(part => {
    const tokens = part.trim().split(/\s+/);
    if (tokens.length >= 2) {
      return { name: tokens[0], rawType: tokens[1], kind: classifyType(tokens[1]) };
    }
    return { name: tokens[0], rawType: 'interface{}', kind: 'unknown' };
  });
}

function parseRustParams(paramStr: string): ParamInfo[] {
  if (!paramStr.trim()) return [];
  return paramStr
    .split(',')
    .map(p => p.trim())
    .filter(p => p && !p.includes('&self') && p !== 'self')
    .map(part => {
      const [name, rawType = ''] = part.split(':').map(x => x.trim());
      return { name, rawType, kind: classifyType(rawType) };
    });
}

// ── 2. Comprehensive Built-In Data Structure Library ────────────────────────────

export const JAVA_PREAMBLE = `
    // ── Built-in LeetCode Data Structures ──────────────────────────────────
    public static class ListNode {
        public int val;
        public ListNode next;
        public ListNode() {}
        public ListNode(int val) { this.val = val; }
        public ListNode(int val, ListNode next) { this.val = val; this.next = next; }
    }

    public static class TreeNode {
        public int val;
        public TreeNode left;
        public TreeNode right;
        public TreeNode() {}
        public TreeNode(int val) { this.val = val; }
        public TreeNode(int val, TreeNode left, TreeNode right) {
            this.val = val; this.left = left; this.right = right;
        }
    }

    public static class Node {
        public int val;
        public List<Node> neighbors;
        public List<Node> children;
        public Node() { neighbors = new ArrayList<>(); children = new ArrayList<>(); }
        public Node(int _val) { val = _val; neighbors = new ArrayList<>(); children = new ArrayList<>(); }
        public Node(int _val, List<Node> _neighbors) { val = _val; neighbors = _neighbors; children = new ArrayList<>(); }
    }

    public static ListNode deserializeList(int[] vals, int pos) {
        if (vals == null || vals.length == 0) return null;
        ListNode dummy = new ListNode(0);
        ListNode cur = dummy;
        ListNode cycleEntry = null;
        for (int i = 0; i < vals.length; i++) {
            cur.next = new ListNode(vals[i]);
            cur = cur.next;
            if (i == pos) cycleEntry = cur;
        }
        if (cycleEntry != null) cur.next = cycleEntry;
        return dummy.next;
    }

    public static String serializeList(ListNode head) {
        if (head == null) return "[]";
        StringBuilder sb = new StringBuilder("[");
        Set<ListNode> visited = new HashSet<>();
        ListNode cur = head;
        boolean first = true;
        while (cur != null) {
            if (visited.contains(cur)) {
                if (!first) sb.append(",");
                sb.append("{\"cycle\":").append(cur.val).append("}");
                break;
            }
            visited.add(cur);
            if (!first) sb.append(",");
            first = false;
            sb.append(cur.val);
            cur = cur.next;
        }
        return sb.append("]").toString();
    }

    public static TreeNode deserializeTree(String json) {
        if (json == null || json.trim().isEmpty() || json.equals("[]") || json.equals("null")) return null;
        String clean = json.replace("[", "").replace("]", "").trim();
        if (clean.isEmpty()) return null;
        String[] parts = clean.split(",");
        if (parts.length == 0 || parts[0].trim().equals("null")) return null;

        TreeNode root = new TreeNode(Integer.parseInt(parts[0].trim()));
        Queue<TreeNode> queue = new LinkedList<>();
        queue.add(root);
        int i = 1;

        while (!queue.isEmpty() && i < parts.length) {
            TreeNode curr = queue.poll();
            if (i < parts.length) {
                String leftVal = parts[i++].trim();
                if (!leftVal.equals("null") && !leftVal.isEmpty()) {
                    curr.left = new TreeNode(Integer.parseInt(leftVal));
                    queue.add(curr.left);
                }
            }
            if (i < parts.length) {
                String rightVal = parts[i++].trim();
                if (!rightVal.equals("null") && !rightVal.isEmpty()) {
                    curr.right = new TreeNode(Integer.parseInt(rightVal));
                    queue.add(curr.right);
                }
            }
        }
        return root;
    }

    public static String serializeTree(TreeNode root) {
        if (root == null) return "[]";
        List<String> list = new ArrayList<>();
        Queue<TreeNode> q = new LinkedList<>();
        q.add(root);
        while (!q.isEmpty()) {
            TreeNode node = q.poll();
            if (node != null) {
                list.add(String.valueOf(node.val));
                q.add(node.left);
                q.add(node.right);
            } else {
                list.add("null");
            }
        }
        while (list.size() > 0 && list.get(list.size() - 1).equals("null")) {
            list.remove(list.size() - 1);
        }
        return "[" + String.join(",", list) + "]";
    }
`;

export const CPP_PREAMBLE = `
// ── Built-in LeetCode Data Structures ──────────────────────────────────────
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

class Node {
public:
    int val;
    std::vector<Node*> neighbors;
    std::vector<Node*> children;
    Node() : val(0) {}
    Node(int _val) : val(_val) {}
    Node(int _val, std::vector<Node*> _neighbors) : val(_val), neighbors(_neighbors) {}
};

inline ListNode* deserializeList(const std::vector<int>& vals, int pos = -1) {
    if (vals.empty()) return nullptr;
    ListNode dummy(0);
    ListNode* cur = &dummy;
    ListNode* cycleEntry = nullptr;
    for (size_t i = 0; i < vals.size(); ++i) {
        cur->next = new ListNode(vals[i]);
        cur = cur->next;
        if (static_cast<int>(i) == pos) cycleEntry = cur;
    }
    if (cycleEntry) cur->next = cycleEntry;
    return dummy.next;
}

inline std::string serializeList(ListNode* head) {
    if (!head) return "[]";
    std::string s = "[";
    std::unordered_set<ListNode*> visited;
    ListNode* cur = head;
    bool first = true;
    while (cur) {
        if (visited.count(cur)) {
            if (!first) s += ",";
            s += "{\\"cycle\\":" + std::to_string(cur->val) + "}";
            break;
        }
        visited.insert(cur);
        if (!first) s += ",";
        first = false;
        s += std::to_string(cur->val);
        cur = cur->next;
    }
    return s + "]";
}

inline TreeNode* deserializeTree(const std::vector<std::string>& vals) {
    if (vals.empty() || vals[0] == "null") return nullptr;
    TreeNode* root = new TreeNode(std::stoi(vals[0]));
    std::queue<TreeNode*> q;
    q.push(root);
    size_t i = 1;
    while (!q.empty() && i < vals.size()) {
        TreeNode* curr = q.front();
        q.pop();
        if (i < vals.size()) {
            if (vals[i] != "null" && !vals[i].empty()) {
                curr->left = new TreeNode(std::stoi(vals[i]));
                q.push(curr->left);
            }
            i++;
        }
        if (i < vals.size()) {
            if (vals[i] != "null" && !vals[i].empty()) {
                curr->right = new TreeNode(std::stoi(vals[i]));
                q.push(curr->right);
            }
            i++;
        }
    }
    return root;
}

inline std::string serializeTree(TreeNode* root) {
    if (!root) return "[]";
    std::vector<std::string> list;
    std::queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* node = q.front();
        q.pop();
        if (node) {
            list.push_back(std::to_string(node->val));
            q.push(node->left);
            q.push(node->right);
        } else {
            list.push_back("null");
        }
    }
    while (!list.empty() && list.back() == "null") list.pop_back();
    std::string s = "[";
    for (size_t i = 0; i < list.size(); ++i) {
        if (i) s += ",";
        s += list[i];
    }
    return s + "]";
}
`;

export const GO_PREAMBLE = `
// ── Built-in LeetCode Data Structures ──────────────────────────────────────
type ListNode struct {
\tVal int
\tNext *ListNode
}

type TreeNode struct {
\tVal int
\tLeft *TreeNode
\tRight *TreeNode
}

type Node struct {
\tVal int
\tNeighbors []*Node
\tChildren []*Node
}

func deserializeList(vals []int, pos int) *ListNode {
\tif len(vals) == 0 { return nil }
\tdummy := &ListNode{}
\tcur := dummy
\tvar cycleEntry *ListNode
\tfor i, v := range vals {
\t\tcur.Next = &ListNode{Val: v}
\t\tcur = cur.Next
\t\tif i == pos { cycleEntry = cur }
\t}
\tif cycleEntry != nil { cur.Next = cycleEntry }
\treturn dummy.Next
}

func serializeList(head *ListNode) string {
\tif head == nil { return "[]" }
\tvar parts []string
\tvisited := make(map[*ListNode]bool)
\tcur := head
\tfor cur != nil {
\t\tif visited[cur] {
\t\t\tparts = append(parts, fmt.Sprintf("{\\\"cycle\\\":%d}", cur.Val))
\t\t\tbreak
\t\t}
\t\tvisited[cur] = true
\t\tparts = append(parts, fmt.Sprintf("%d", cur.Val))
\t\tcur = cur.Next
\t}
\treturn "[" + strings.Join(parts, ",") + "]"
}

func deserializeTree(vals []string) *TreeNode {
\tif len(vals) == 0 || vals[0] == "null" { return nil }
\tv0, _ := strconv.Atoi(vals[0])
\troot := &TreeNode{Val: v0}
\tqueue := []*TreeNode{root}
\ti := 1
\tfor len(queue) > 0 && i < len(vals) {
\t\tcurr := queue[0]
\t\tqueue = queue[1:]
\t\tif i < len(vals) {
\t\t\tif vals[i] != "null" && vals[i] != "" {
\t\t\t\tv, _ := strconv.Atoi(vals[i])
\t\t\t\tcurr.Left = &TreeNode{Val: v}
\t\t\t\tqueue = append(queue, curr.Left)
\t\t\t}
\t\t\ti++
\t\t}
\t\tif i < len(vals) {
\t\t\tif vals[i] != "null" && vals[i] != "" {
\t\t\t\tv, _ := strconv.Atoi(vals[i])
\t\t\t\tcurr.Right = &TreeNode{Val: v}
\t\t\t\tqueue = append(queue, curr.Right)
\t\t\t}
\t\t\ti++
\t\t}
\t}
\treturn root
}

func serializeTree(root *TreeNode) string {
\tif root == nil { return "[]" }
\tvar list []string
\tqueue := []*TreeNode{root}
\tfor len(queue) > 0 {
\t\tnode := queue[0]
\t\tqueue = queue[1:]
\t\tif node != nil {
\t\t\tlist = append(list, fmt.Sprintf("%d", node.Val))
\t\t\tqueue = append(queue, node.Left, node.Right)
\t\t} else {
\t\t\tlist = append(list, "null")
\t\t}
\t}
\tfor len(list) > 0 && list[len(list)-1] == "null" {
\t\tlist = list[:len(list)-1]
\t}
\treturn "[" + strings.Join(list, ",") + "]"
}
`;

export const RUST_PREAMBLE = `
// ── Built-in LeetCode Data Structures ──────────────────────────────────────
#[derive(PartialEq, Eq, Clone, Debug)]
pub struct ListNode {
    pub val: i32,
    pub next: Option<Box<ListNode>>,
}

impl ListNode {
    #[inline]
    pub fn new(val: i32) -> Self {
        ListNode { next: None, val }
    }
}

use std::rc::Rc;
use std::cell::RefCell;

#[derive(Debug, PartialEq, Eq)]
pub struct TreeNode {
    pub val: i32,
    pub left: Option<Rc<RefCell<TreeNode>>>,
    pub right: Option<Rc<RefCell<TreeNode>>>,
}

impl TreeNode {
    #[inline]
    pub fn new(val: i32) -> Self {
        TreeNode { val, left: None, right: None }
    }
}

pub fn deserialize_list(vals: &[i32]) -> Option<Box<ListNode>> {
    let mut head = None;
    for &v in vals.iter().rev() {
        let mut node = Box::new(ListNode::new(v));
        node.next = head;
        head = Some(node);
    }
    head
}

pub fn serialize_list(mut head: Option<Box<ListNode>>) -> String {
    let mut parts = Vec::new();
    while let Some(node) = head {
        parts.push(node.val.to_string());
        head = node.next;
    }
    format!("[{}]", parts.join(","))
}
`;

export const PYTHON_PREAMBLE = `
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class Node:
    def __init__(self, val=0, neighbors=None, children=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []
        self.children = children if children is not None else []

def deserialize_list(vals, pos=-1):
    if not vals: return None
    dummy = ListNode(0)
    cur = dummy
    cycle_entry = None
    for i, v in enumerate(vals):
        cur.next = ListNode(v)
        cur = cur.next
        if i == pos: cycle_entry = cur
    if cycle_entry: cur.next = cycle_entry
    return dummy.next

def serialize_list(head):
    if not head: return "[]"
    parts, visited, cur = [], set(), head
    while cur:
        if cur in visited:
            parts.append(f'{{"cycle":{cur.val}}}')
            break
        visited.add(cur)
        parts.append(str(cur.val))
        cur = cur.next
    return "[" + ",".join(parts) + "]"

def deserialize_tree(vals):
    if not vals or vals[0] is None: return None
    root = TreeNode(vals[0])
    queue = [root]
    i = 1
    while queue and i < len(vals):
        curr = queue.pop(0)
        if i < len(vals):
            if vals[i] is not None:
                curr.left = TreeNode(vals[i])
                queue.append(curr.left)
            i += 1
        if i < len(vals):
            if vals[i] is not None:
                curr.right = TreeNode(vals[i])
                queue.append(curr.right)
            i += 1
    return root

def serialize_tree(root):
    if not root: return "[]"
    res, queue = [], [root]
    while queue:
        node = queue.pop(0)
        if node:
            res.append(str(node.val))
            queue.append(node.left)
            queue.append(node.right)
        else:
            res.append("null")
    while res and res[-1] == "null": res.pop()
    return "[" + ",".join(res) + "]"
`;

export const JS_PREAMBLE = `
function ListNode(val, next) {
    this.val = (val===undefined ? 0 : val);
    this.next = (next===undefined ? null : next);
}

function TreeNode(val, left, right) {
    this.val = (val===undefined ? 0 : val);
    this.left = (left===undefined ? null : left);
    this.right = (right===undefined ? null : right);
}

function Node(val, neighbors, children) {
    this.val = (val===undefined ? 0 : val);
    this.neighbors = (neighbors===undefined ? [] : neighbors);
    this.children = (children===undefined ? [] : children);
}

function deserializeList(vals, pos = -1) {
    if (!vals || vals.length === 0) return null;
    const dummy = new ListNode(0);
    let cur = dummy;
    let cycleEntry = null;
    for (let i = 0; i < vals.length; i++) {
        cur.next = new ListNode(vals[i]);
        cur = cur.next;
        if (i === pos) cycleEntry = cur;
    }
    if (cycleEntry) cur.next = cycleEntry;
    return dummy.next;
}

function serializeList(head) {
    if (!head) return "[]";
    const parts = [];
    const visited = new Set();
    let cur = head;
    while (cur) {
        if (visited.has(cur)) {
            parts.push(\`{"cycle":\${cur.val}}\`);
            break;
        }
        visited.add(cur);
        parts.push(cur.val);
        cur = cur.next;
    }
    return "[" + parts.join(",") + "]";
}

function deserializeTree(vals) {
    if (!vals || vals.length === 0 || vals[0] === null) return null;
    const root = new TreeNode(vals[0]);
    const queue = [root];
    let i = 1;
    while (queue.length > 0 && i < vals.length) {
        const curr = queue.shift();
        if (i < vals.length) {
            if (vals[i] !== null && vals[i] !== undefined) {
                curr.left = new TreeNode(vals[i]);
                queue.push(curr.left);
            }
            i++;
        }
        if (i < vals.length) {
            if (vals[i] !== null && vals[i] !== undefined) {
                curr.right = new TreeNode(vals[i]);
                queue.push(curr.right);
            }
            i++;
        }
    }
    return root;
}

function serializeTree(root) {
    if (!root) return "[]";
    const res = [];
    const queue = [root];
    while (queue.length > 0) {
        const node = queue.shift();
        if (node) {
            res.push(node.val);
            queue.push(node.left);
            queue.push(node.right);
        } else {
            res.push("null");
        }
    }
    while (res.length > 0 && res[res.length - 1] === "null") res.pop();
    return "[" + res.join(",") + "]";
}
`;

// ── 3. Type Conversion & Argument Deserializer ──────────────────────────────────

export function generateArgDeserializer(param: ParamInfo, rawVal: any, lang: SupportedLang, argIdx: number): { decl: string; varName: string } {
  const varName = `__bb_a${argIdx}__`;

  switch (lang) {
    case 'java': {
      if (param.kind === 'listnode') {
        const arr = Array.isArray(rawVal) ? rawVal : [];
        return {
          decl: `        ListNode ${varName} = deserializeList(new int[]{${arr.join(',')}}, -1);`,
          varName,
        };
      }
      if (param.kind === 'treenode') {
        const jsonStr = JSON.stringify(rawVal).replace(/"/g, '\\"');
        return {
          decl: `        TreeNode ${varName} = deserializeTree("${jsonStr}");`,
          varName,
        };
      }
      if (param.kind === '2d-array') {
        const rows = (Array.isArray(rawVal) ? rawVal : []).map(r => `new int[]{${(Array.isArray(r) ? r : [r]).join(',')}}`).join(',');
        return {
          decl: `        int[][] ${varName} = new int[][]{${rows}};`,
          varName,
        };
      }
      if (param.kind === 'array') {
        const items = Array.isArray(rawVal) ? rawVal.join(',') : '';
        return {
          decl: `        int[] ${varName} = new int[]{${items}};`,
          varName,
        };
      }
      if (typeof rawVal === 'string') {
        return {
          decl: `        String ${varName} = "${rawVal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";`,
          varName,
        };
      }
      if (typeof rawVal === 'boolean') {
        return { decl: `        boolean ${varName} = ${rawVal};`, varName };
      }
      return { decl: `        int ${varName} = ${rawVal};`, varName };
    }

    case 'cpp': {
      if (param.kind === 'listnode') {
        const arr = Array.isArray(rawVal) ? rawVal : [];
        return {
          decl: `    ListNode* ${varName} = deserializeList({${arr.join(',')}});`,
          varName,
        };
      }
      if (param.kind === 'treenode') {
        const arr = (Array.isArray(rawVal) ? rawVal : []).map(x => x === null ? '"null"' : `"${x}"`).join(',');
        return {
          decl: `    TreeNode* ${varName} = deserializeTree({${arr}});`,
          varName,
        };
      }
      if (param.kind === '2d-array') {
        const rows = (Array.isArray(rawVal) ? rawVal : []).map(r => `{${(Array.isArray(r) ? r : [r]).join(',')}}`).join(',');
        return {
          decl: `    std::vector<std::vector<int>> ${varName} = {${rows}};`,
          varName,
        };
      }
      if (param.kind === 'array') {
        const items = Array.isArray(rawVal) ? rawVal.join(',') : '';
        return {
          decl: `    std::vector<int> ${varName} = {${items}};`,
          varName,
        };
      }
      if (typeof rawVal === 'string') {
        return {
          decl: `    std::string ${varName} = "${rawVal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";`,
          varName,
        };
      }
      if (typeof rawVal === 'boolean') {
        return { decl: `    bool ${varName} = ${rawVal ? 'true' : 'false'};`, varName };
      }
      return { decl: `    int ${varName} = ${rawVal};`, varName };
    }

    case 'go': {
      if (param.kind === 'listnode') {
        const arr = Array.isArray(rawVal) ? rawVal : [];
        return {
          decl: `\t${varName} := deserializeList([]int{${arr.join(',')}}, -1)`,
          varName,
        };
      }
      if (param.kind === 'treenode') {
        const arr = (Array.isArray(rawVal) ? rawVal : []).map(x => x === null ? '"null"' : `"${x}"`).join(',');
        return {
          decl: `\t${varName} := deserializeTree([]string{${arr}})`,
          varName,
        };
      }
      if (param.kind === '2d-array') {
        const rows = (Array.isArray(rawVal) ? rawVal : []).map(r => `[]int{${(Array.isArray(r) ? r : [r]).join(',')}}`).join(',');
        return {
          decl: `\t${varName} := [][]int{${rows}}`,
          varName,
        };
      }
      if (param.kind === 'array') {
        const items = Array.isArray(rawVal) ? rawVal.join(',') : '';
        return {
          decl: `\t${varName} := []int{${items}}`,
          varName,
        };
      }
      if (typeof rawVal === 'string') {
        return {
          decl: `\t${varName} := "${rawVal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
          varName,
        };
      }
      return { decl: `\t${varName} := ${rawVal}`, varName };
    }

    case 'rust': {
      if (param.kind === 'listnode') {
        const arr = Array.isArray(rawVal) ? rawVal : [];
        return {
          decl: `    let ${varName} = deserialize_list(&[${arr.join(',')}]);`,
          varName,
        };
      }
      if (param.kind === 'array') {
        const items = Array.isArray(rawVal) ? rawVal.join(',') : '';
        return {
          decl: `    let ${varName}: Vec<i32> = vec![${items}];`,
          varName,
        };
      }
      if (typeof rawVal === 'string') {
        return {
          decl: `    let ${varName} = String::from("${rawVal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}");`,
          varName,
        };
      }
      return { decl: `    let ${varName} = ${rawVal};`, varName };
    }

    case 'python': {
      if (param.kind === 'listnode') {
        const arr = Array.isArray(rawVal) ? JSON.stringify(rawVal) : '[]';
        return { decl: `${varName} = deserialize_list(${arr})`, varName };
      }
      if (param.kind === 'treenode') {
        const arr = Array.isArray(rawVal) ? JSON.stringify(rawVal) : '[]';
        return { decl: `${varName} = deserialize_tree(${arr})`, varName };
      }
      return { decl: `${varName} = ${JSON.stringify(rawVal)}`, varName };
    }

    case 'javascript': {
      if (param.kind === 'listnode') {
        const arr = Array.isArray(rawVal) ? JSON.stringify(rawVal) : '[]';
        return { decl: `const ${varName} = deserializeList(${arr});`, varName };
      }
      if (param.kind === 'treenode') {
        const arr = Array.isArray(rawVal) ? JSON.stringify(rawVal) : '[]';
        return { decl: `const ${varName} = deserializeTree(${arr});`, varName };
      }
      return { decl: `const ${varName} = ${JSON.stringify(rawVal)};`, varName };
    }
  }
}

export function parseHarnessArgs(inputJson: string | null, paramCount: number, params?: ParamInfo[]): any[] {
  if (!inputJson || inputJson.trim() === '') return [];
  try {
    const parsed = JSON.parse(inputJson);
    if (!Array.isArray(parsed)) return [parsed];
    if (paramCount === 1) {
      const firstParamKind = params?.[0]?.kind;
      if (firstParamKind === '2d-array' || firstParamKind === 'array' || firstParamKind === 'listnode' || firstParamKind === 'treenode') {
        return [parsed];
      }
      if (parsed.length > 0 && !Array.isArray(parsed[0])) {
        return [parsed];
      }
    }
    return parsed;
  } catch {
    return [];
  }
}
