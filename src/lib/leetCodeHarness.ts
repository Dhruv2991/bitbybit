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
                sb.append('{"cycle":').append(cur.val).append('}');
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
use std::rc::Rc;
use std::cell::RefCell;
use std::collections::VecDeque;

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

pub fn deserialize_tree(vals: &[Option<i32>]) -> Option<Rc<RefCell<TreeNode>>> {
    if vals.is_empty() || vals[0].is_none() { return None; }
    let root = Rc::new(RefCell::new(TreeNode::new(vals[0].unwrap())));
    let mut queue = VecDeque::new();
    queue.push_back(Rc::clone(&root));
    let mut i = 1;
    while !queue.is_empty() && i < vals.len() {
        let curr = queue.pop_front().unwrap();
        if i < vals.len() {
            if let Some(val) = vals[i] {
                let left = Rc::new(RefCell::new(TreeNode::new(val)));
                curr.borrow_mut().left = Some(Rc::clone(&left));
                queue.push_back(left);
            }
            i += 1;
        }
        if i < vals.len() {
            if let Some(val) = vals[i] {
                let right = Rc::new(RefCell::new(TreeNode::new(val)));
                curr.borrow_mut().right = Some(Rc::clone(&right));
                queue.push_back(right);
            }
            i += 1;
        }
    }
    Some(root)
}

pub fn serialize_tree(root: Option<Rc<RefCell<TreeNode>>>) -> String {
    if root.is_none() { return "[]".to_string(); }
    let mut list = Vec::new();
    let mut queue = VecDeque::new();
    queue.push_back(root);
    while let Some(node_opt) = queue.pop_front() {
        if let Some(node) = node_opt {
            let n = node.borrow();
            list.push(n.val.to_string());
            queue.push_back(n.left.clone());
            queue.push_back(n.right.clone());
        } else {
            list.push("null".to_string());
        }
    }
    while !list.is_empty() && list.last().map(|s| s.as_str()) == Some("null") {
        list.pop();
    }
    format!("[{}]", list.join(","))
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

// ── 4. Clean Driver-Based Execution Program Generators ──────────────────────────

export function splitCppHeaders(code: string): { headers: string; body: string } {
  const lines = code.split('\n');
  let i = 0;
  const headerLines: string[] = [];

  while (i < lines.length) {
    const t = lines[i].trim();
    if (
      t.startsWith('#include') || t.startsWith('#define') || t.startsWith('#pragma') ||
      t.startsWith('#ifndef') || t.startsWith('#ifdef') || t.startsWith('#endif') ||
      t.startsWith('#undef') || t === ''
    ) {
      headerLines.push(lines[i]);
      i++;
    } else {
      break;
    }
  }

  return { headers: headerLines.join('\n').trimEnd(), body: lines.slice(i).join('\n') };
}

export function splitJavaImports(code: string): { imports: string; body: string } {
  const lines = code.split('\n');
  let i = 0;
  const importLines: string[] = [];

  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('import ') || t.startsWith('package ') || t === '') {
      importLines.push(lines[i]);
      i++;
    } else {
      break;
    }
  }

  return { imports: importLines.join('\n').trimEnd(), body: lines.slice(i).join('\n') };
}

export function splitGoImports(code: string): { packageLine: string; imports: string; body: string } {
  const lines = code.split('\n');
  let i = 0;

  while (i < lines.length && lines[i].trim() === '') i++;

  let packageLine = '';
  if (i < lines.length && lines[i].trim().startsWith('package ')) {
    packageLine = lines[i].trim();
    i++;
  }

  while (i < lines.length && lines[i].trim() === '') i++;

  const importLines: string[] = [];

  if (i < lines.length && /^import\s+"/.test(lines[i].trim())) {
    importLines.push(lines[i]);
    i++;
  } else if (i < lines.length && /^import\s*\(/.test(lines[i].trim())) {
    importLines.push(lines[i]);
    i++;
    while (i < lines.length && !lines[i].includes(')')) {
      importLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) { importLines.push(lines[i]); i++; }
  }

  return { packageLine, imports: importLines.join('\n'), body: lines.slice(i).join('\n') };
}

export function splitRustUses(code: string): { uses: string; body: string } {
  const lines = code.split('\n');
  let i = 0;
  const useLines: string[] = [];

  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('use ') || t.startsWith('extern crate') || t.startsWith('#![') || t === '') {
      useLines.push(lines[i]);
      i++;
    } else {
      break;
    }
  }

  return { uses: useLines.join('\n').trimEnd(), body: lines.slice(i).join('\n') };
}

// ── 5. Statement-Level Multi-Step AST & Line Instrumenter ──────────────────────

const KEYWORDS_SET = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'goto', 'public', 'private', 'protected', 'static', 'final', 'const',
  'class', 'struct', 'interface', 'enum', 'fn', 'func', 'let', 'mut', 'var',
  'auto', 'void', 'int', 'long', 'float', 'double', 'bool', 'boolean', 'char',
  'string', 'import', 'package', 'use', 'impl', 'true', 'false', 'null', 'nil',
  'nullptr', 'None', 'Some', 'Ok', 'Err', 'new', 'delete', 'this', 'self', 'super'
]);

export function stripStringsAndComments(line: string, lang: SupportedLang): string {
  let s = line.replace(/\/\/.*$/, '');
  s = s.replace(/\/\*.*?\*\//g, '');
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  s = s.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  if (lang === 'rust') {
    s = s.replace(/'[a-zA-Z_]\w*/g, '');
  }
  return s;
}

function countChar(str: string, ch: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ch) count++;
  }
  return count;
}

function extractVarList(str: string): string[] {
  return str.split(',').map(part => {
    const item = part.trim().split(/\s*=/)[0].trim();
    const tokens = item.split(/\s+/);
    return tokens[tokens.length - 1];
  }).filter(Boolean);
}

export function extractDeclaredVariables(line: string, lang: SupportedLang): string[] {
  const vars: string[] = [];
  const clean = stripStringsAndComments(line, lang).trim();

  if (lang === 'java') {
    const forEachMatch = clean.match(/for\s*\(\s*(?:final\s+)?[\w<>\[\]]+\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/);
    if (forEachMatch) vars.push(forEachMatch[1]);

    const forMatch = clean.match(/for\s*\(\s*(?:final\s+)?[\w<>\[\]]+\s+([a-zA-Z_$][a-zA-Z0-9_$]*(?:\s*=\s*[^;]+)?(?:\s*,\s*[a-zA-Z_$][a-zA-Z0-9_$]*(?:\s*=\s*[^;]+)?)*)\s*;/);
    if (forMatch) {
      extractVarList(forMatch[1]).forEach(v => vars.push(v));
    }

    const declMatch = clean.match(/(?:^|[;{}]\s*)(?:final\s+)?(?:byte|short|int|long|float|double|boolean|char|String|var|ListNode|TreeNode|Node|StringBuilder|List<[^>]+>|Map<[^>]+>|Set<[^>]+>|Queue<[^>]+>|Deque<[^>]+>|Stack<[^>]+>|[\w<>]+(?:\[\])+|[\w<>]+)\s+([a-zA-Z_$][a-zA-Z0-9_$]*(?:\s*=\s*[^,;]+)?(?:\s*,\s*[a-zA-Z_$][a-zA-Z0-9_$]*(?:\s*=\s*[^,;]+)?)*)\s*;/);
    if (declMatch) {
      extractVarList(declMatch[1]).forEach(v => vars.push(v));
    }
  } else if (lang === 'cpp') {
    const forRangeMatch = clean.match(/for\s*\(\s*(?:const\s+)?(?:auto|[\w<>:*&]+)\s*&?\s*([a-zA-Z_]\w*)\s*:/);
    if (forRangeMatch) vars.push(forRangeMatch[1]);

    const forMatch = clean.match(/for\s*\(\s*(?:const\s+)?[\w<>:*&]+\s+([a-zA-Z_]\w*(?:\s*=\s*[^;]+)?(?:\s*,\s*[a-zA-Z_]\w*(?:\s*=\s*[^;]+)?)*)\s*;/);
    if (forMatch) {
      extractVarList(forMatch[1]).forEach(v => vars.push(v));
    }

    const declMatch = clean.match(/(?:^|[;{}]\s*)(?:const\s+)?(?:int|long|long\s+long|double|float|bool|char|size_t|auto|string|ListNode\*?|TreeNode\*?|Node\*?|vector<[\w<>,\s:*&]+>|unordered_map<[\w<>,\s:*&]+>|map<[\w<>,\s:*&]+>|unordered_set<[\w<>,\s:*&]+>|set<[\w<>,\s:*&]+>|queue<[\w<>,\s:*&]+>|stack<[\w<>,\s:*&]+>|pair<[\w<>,\s:*&]+>|[\w:*&<>]+)\s+([a-zA-Z_]\w*(?:\s*=\s*[^,;]+|\s*\([^)]*\))?(?:\s*,\s*[a-zA-Z_]\w*(?:\s*=\s*[^,;]+|\s*\([^)]*\))?)*)\s*;/);
    if (declMatch) {
      extractVarList(declMatch[1]).forEach(v => vars.push(v));
    }
  } else if (lang === 'go') {
    const rangeMatch = clean.match(/for\s+([a-zA-Z_]\w*)(?:\s*,\s*([a-zA-Z_]\w*))?\s*:=\s*range/);
    if (rangeMatch) {
      if (rangeMatch[1] && rangeMatch[1] !== '_') vars.push(rangeMatch[1]);
      if (rangeMatch[2] && rangeMatch[2] !== '_') vars.push(rangeMatch[2]);
    }

    const forMatch = clean.match(/for\s+([a-zA-Z_]\w*)\s*:=/);
    if (forMatch && !rangeMatch) {
      if (forMatch[1] !== '_') vars.push(forMatch[1]);
    }

    const shortDecl = clean.match(/(?:if\s+)?([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)\s*:=/);
    if (shortDecl && !clean.startsWith('for')) {
      shortDecl[1].split(',').map(s => s.trim()).filter(s => s && s !== '_').forEach(v => vars.push(v));
    }

    const varDecl = clean.match(/var\s+([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)/);
    if (varDecl) {
      varDecl[1].split(',').map(s => s.trim()).filter(s => s && s !== '_').forEach(v => vars.push(v));
    }
  } else if (lang === 'rust') {
    const forTupleMatch = clean.match(/for\s*\(\s*([a-zA-Z_]\w*)\s*,\s*([a-zA-Z_]\w*)\s*\)\s+in\s+/);
    if (forTupleMatch) {
      if (forTupleMatch[1] !== '_') vars.push(forTupleMatch[1]);
      if (forTupleMatch[2] !== '_') vars.push(forTupleMatch[2]);
    } else {
      const forMatch = clean.match(/for\s+([a-zA-Z_]\w*)\s+in\s+/);
      if (forMatch && forMatch[1] !== '_') vars.push(forMatch[1]);
    }

    const letMatch = clean.match(/let\s+(?:mut\s+)?([a-zA-Z_]\w*)/);
    if (letMatch && letMatch[1] !== '_') vars.push(letMatch[1]);

    const letTuple = clean.match(/let\s+(?:mut\s+)?\(\s*([a-zA-Z_]\w*)\s*,\s*([a-zA-Z_]\w*)\s*\)/);
    if (letTuple) {
      if (letTuple[1] !== '_') vars.push(letTuple[1]);
      if (letTuple[2] !== '_') vars.push(letTuple[2]);
    }

    const whileLet = clean.match(/while\s+let\s+(?:Some|Ok)\s*\(\s*([a-zA-Z_]\w*)\s*\)/);
    if (whileLet && whileLet[1] !== '_') vars.push(whileLet[1]);
  }

  return vars.filter(v => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v) && !KEYWORDS_SET.has(v));
}

export function emitTraceStatement(lineNum: number, vars: string[], lang: SupportedLang): string {
  if (lang === 'java') {
    if (vars.length === 0) return `__bb_emit(${lineNum}, "{}");`;
    const pairs = vars.map(v => `"${v}", __bb_repr(${v})`).join(', ');
    return `__bb_emit(${lineNum}, __bb_vars(${pairs}));`;
  }
  if (lang === 'cpp') {
    if (vars.length === 0) return `__bb_emit(${lineNum}, "{}");`;
    const pairs = vars.map(v => `{"${v}", __bb_repr(${v})}`).join(', ');
    return `__bb_emit(${lineNum}, __bb_vars({${pairs}}));`;
  }
  if (lang === 'go') {
    if (vars.length === 0) return `__bb_emit(${lineNum}, "{}")`;
    const pairs = vars.map(v => `"${v}", __bb_repr(${v})`).join(', ');
    return `__bb_emit(${lineNum}, __bb_vars(${pairs}))`;
  }
  if (lang === 'rust') {
    if (vars.length === 0) return `bb_emit!(${lineNum}, "{}");`;
    const pairs = vars.map(v => `("${v}", bb_repr(&${v}))`).join(', ');
    return `bb_emit!(${lineNum}, &bb_vars(&[${pairs}]));`;
  }
  return '';
}

export function normalizeUnbracedBlocks(code: string): string {
  const lines = code.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const singleLineMatch = trimmed.match(/^(if\s*\([^)]+\)|else\s+if\s*\([^)]+\)|else|for\s*\([^)]+\)|while\s*\([^)]+\))\s+([^{};]+;)$/);
    if (singleLineMatch) {
      const header = singleLineMatch[1];
      const stmt = singleLineMatch[2];
      const indent = line.match(/^\s*/)?.[0] || '';
      result.push(`${indent}${header} {`);
      result.push(`${indent}    ${stmt}`);
      result.push(`${indent}}`);
      continue;
    }

    const isControlHeaderWithoutBrace =
      /^(if\s*\([^)]+\)|else\s+if\s*\([^)]+\)|else|for\s*\([^)]+\)|while\s*\([^)]+\))$/.test(trimmed) &&
      !trimmed.endsWith('{');

    if (isControlHeaderWithoutBrace && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      if (!nextTrimmed.startsWith('{')) {
        const indent = line.match(/^\s*/)?.[0] || '';
        result.push(`${line} {`);
        i++;
        result.push(lines[i]);
        result.push(`${indent}}`);
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

export function instrumentCompiledMethodBody(userCode: string, lang: SupportedLang): string {
  const normalized = (lang === 'java' || lang === 'cpp') ? normalizeUnbracedBlocks(userCode) : userCode;
  const sig = inspectSignature(userCode, lang);
  const paramNames = (sig.params || []).map(p => p.name).filter(Boolean);

  const rawLines = normalized.split('\n');
  const instrumentedLines: string[] = [];

  const scopeStack: Set<string>[] = [new Set(paramNames)];

  function getActiveVars(): string[] {
    const all = new Set<string>();
    for (const scope of scopeStack) {
      for (const v of scope) {
        all.add(v);
      }
    }
    return Array.from(all);
  }

  let inMethod = false;
  let braceDepth = 0;
  let methodStartLine = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const origLineNum = i + 1;
    const line = rawLines[i];
    const trimmed = line.trim();

    if (
      trimmed === '' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('package ') ||
      trimmed.startsWith('use ')
    ) {
      instrumentedLines.push(line);
      continue;
    }

    if (!inMethod) {
      const isFnHeader =
        (lang === 'java' && /(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+\w+\s*\(/.test(trimmed)) ||
        (lang === 'cpp' && /\b(?:\w+::)?[\w<>:*&\s]+\s+\w+\s*\([^)]*\)\s*\{?/.test(trimmed) && !trimmed.startsWith('class ') && !trimmed.startsWith('struct ')) ||
        (lang === 'go' && /^func\s+/.test(trimmed)) ||
        (lang === 'rust' && /^(?:pub\s+)?fn\s+/.test(trimmed));

      if (isFnHeader) {
        inMethod = true;
        methodStartLine = origLineNum;
        instrumentedLines.push(line);

        if (trimmed.includes('{')) {
          braceDepth += countChar(stripStringsAndComments(trimmed, lang), '{') - countChar(stripStringsAndComments(trimmed, lang), '}');
          const active = getActiveVars();
          instrumentedLines.push('        ' + emitTraceStatement(origLineNum, active, lang));
        }
        continue;
      }

      instrumentedLines.push(line);
      continue;
    }

    if (inMethod && braceDepth === 0 && trimmed.startsWith('{')) {
      braceDepth++;
      instrumentedLines.push(line);
      const active = getActiveVars();
      instrumentedLines.push('        ' + emitTraceStatement(methodStartLine > 0 ? methodStartLine : origLineNum, active, lang));
      continue;
    }

    const declaredOnThisLine = extractDeclaredVariables(line, lang);
    const activeBeforeStmt = getActiveVars();

    const isControlBlockStart =
      trimmed.startsWith('for ') || trimmed.startsWith('for(') ||
      trimmed.startsWith('while ') || trimmed.startsWith('while(') ||
      trimmed.startsWith('if ') || trimmed.startsWith('if(') ||
      trimmed.startsWith('else if') || trimmed.startsWith('} else if') ||
      trimmed.startsWith('else') || trimmed.startsWith('} else') ||
      trimmed.startsWith('switch ') || trimmed.startsWith('switch(');

    const isReturn = trimmed.startsWith('return ') || trimmed.startsWith('return;') || (lang === 'rust' && !trimmed.endsWith(';') && !trimmed.endsWith('}') && !trimmed.endsWith('{') && trimmed.length > 0 && !trimmed.startsWith('let ') && !trimmed.startsWith('for ') && !trimmed.startsWith('if '));
    const isStatement = trimmed.endsWith(';') || isReturn || isControlBlockStart;

    const openBraces = countChar(stripStringsAndComments(line, lang), '{');
    const closeBraces = countChar(stripStringsAndComments(line, lang), '}');

    if (closeBraces > 0) {
      for (let b = 0; b < closeBraces; b++) {
        if (scopeStack.length > 1) {
          scopeStack.pop();
        }
        braceDepth = Math.max(0, braceDepth - 1);
      }
      if (braceDepth === 0) {
        inMethod = false;
      }
    }

    if (inMethod && isStatement && trimmed !== '{' && trimmed !== '}' && !trimmed.startsWith('class ') && !trimmed.startsWith('struct ')) {
      if (trimmed.startsWith('else {') || trimmed.startsWith('} else {') || trimmed === 'else') {
        instrumentedLines.push(line);
        if (openBraces > 0) {
          for (let b = 0; b < openBraces; b++) {
            scopeStack.push(new Set());
            braceDepth++;
          }
          instrumentedLines.push('        ' + emitTraceStatement(origLineNum, getActiveVars(), lang));
        }
        continue;
      }

      if (trimmed.startsWith('for') || trimmed.startsWith('while')) {
        instrumentedLines.push('        ' + emitTraceStatement(origLineNum, activeBeforeStmt, lang));
        instrumentedLines.push(line);

        if (openBraces > 0) {
          for (let b = 0; b < openBraces; b++) {
            const newScope = new Set(declaredOnThisLine);
            scopeStack.push(newScope);
            braceDepth++;
          }
          instrumentedLines.push('        ' + emitTraceStatement(origLineNum, getActiveVars(), lang));
        }
        continue;
      }

      instrumentedLines.push('        ' + emitTraceStatement(origLineNum, activeBeforeStmt, lang));
    }

    if (declaredOnThisLine.length > 0) {
      const topScope = scopeStack[scopeStack.length - 1];
      for (const v of declaredOnThisLine) {
        topScope.add(v);
      }
    }

    if (openBraces > 0 && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('else')) {
      for (let b = 0; b < openBraces; b++) {
        scopeStack.push(new Set(declaredOnThisLine));
        braceDepth++;
      }
    }

    if (!trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('else {') && !trimmed.startsWith('} else {') && trimmed !== 'else') {
      instrumentedLines.push(line);
    }
  }

  return instrumentedLines.join('\n');
}

// ── 6. Driver Program Builders with Multi-Step Statement Tracing ───────────────

export function buildJavaDriverProgram(userCode: string, inputJson: string | null): string {
  const { imports: userImports, body: userBody } = splitJavaImports(userCode);

  const REQUIRED_IMPORTS = ['import java.util.*;', 'import java.util.stream.*;'];
  const existingImportSet = new Set(userImports.split('\n').map(l => l.trim()).filter(Boolean));
  const extraImports = REQUIRED_IMPORTS.filter(im => !existingImportSet.has(im));

  const traceHelper = [
    "    // ── BB Trace Helpers ──────────────────────────────────────────────────",
    "    public static void __bb_emit(int line, String vars) {",
    "        System.out.println(\"__BB_TRACE__:{\\\"line\\\":\" + line + \",\\\"vars\\\":\" + vars + \"}\");",
    "    }",
    "",
    "    public static String __bb_vars(Object... pairs) {",
    "        StringBuilder sb = new StringBuilder(\"{\");",
    "        for (int i = 0; i < pairs.length; i += 2) {",
    "            if (i > 0) sb.append(\",\");",
    "            sb.append(\"\\\"\").append(pairs[i]).append(\"\\\":\").append(pairs[i + 1]);",
    "        }",
    "        return sb.append(\"}\").toString();",
    "    }",
    "",
    "    public static String __bb_escapeStr(String v) {",
    "        if (v == null) return \"\";",
    "        return v.replace(\"\\\\\", \"\\\\\\\\\").replace(\"\\\"\", \"\\\\\\\"\").replace(\"\\n\", \"\\\\n\").replace(\"\\r\", \"\\\\r\").replace(\"\\t\", \"\\\\t\");",
    "    }",
    "",
    "    public static String __bb_repr(Object v) {",
    "        if (v == null) return \"null\";",
    "        if (v instanceof ListNode) return serializeList((ListNode) v);",
    "        if (v instanceof TreeNode) return serializeTree((TreeNode) v);",
    "        if (v instanceof String) return \"\\\"\" + __bb_escapeStr((String) v) + \"\\\"\";",
    "        if (v instanceof Character) return \"\\\"\" + __bb_escapeStr(String.valueOf(v)) + \"\\\"\";",
    "        if (v instanceof Boolean || v instanceof Number) return String.valueOf(v);",
    "        if (v instanceof int[]) return Arrays.toString((int[]) v).replace(\" \", \"\");",
    "        if (v instanceof long[]) return Arrays.toString((long[]) v).replace(\" \", \"\");",
    "        if (v instanceof double[]) return Arrays.toString((double[]) v).replace(\" \", \"\");",
    "        if (v instanceof boolean[]) return Arrays.toString((boolean[]) v).replace(\" \", \"\");",
    "        if (v instanceof char[]) return \"\\\"\" + __bb_escapeStr(new String((char[]) v)) + \"\\\"\";",
    "        if (v instanceof Object[]) return Arrays.deepToString((Object[]) v).replace(\" \", \"\");",
    "        if (v instanceof Map) {",
    "            Map<?, ?> m = (Map<?, ?>) v;",
    "            StringBuilder sb = new StringBuilder(\"{\");",
    "            boolean first = true;",
    "            for (Map.Entry<?, ?> e : m.entrySet()) {",
    "                if (!first) sb.append(\",\");",
    "                first = false;",
    "                sb.append(\"\\\"\").append(__bb_escapeStr(String.valueOf(e.getKey()))).append(\"\\\":\").append(__bb_repr(e.getValue()));",
    "            }",
    "            return sb.append(\"}\").toString();",
    "        }",
    "        if (v instanceof Collection) {",
    "            Collection<?> c = (Collection<?>) v;",
    "            StringBuilder sb = new StringBuilder(\"[\");",
    "            boolean first = true;",
    "            for (Object item : c) {",
    "                if (!first) sb.append(\",\");",
    "                first = false;",
    "                sb.append(__bb_repr(item));",
    "            }",
    "            return sb.append(\"]\").toString();",
    "        }",
    "        return \"\\\"\" + __bb_escapeStr(String.valueOf(v)) + \"\\\"\";",
    "    }",
  ].join('\n');

  // Perform multi-step statement-level instrumentation
  const instrumentedBody = instrumentCompiledMethodBody(userBody, 'java');

  // Check if the user code contains a class declaration
  const hasClassDecl = /(?:public\s+|private\s+|protected\s+|static\s+|abstract\s+|final\s+)*class\s+\w+/.test(instrumentedBody);

  let cleanBody: string;

  if (!hasClassDecl) {
    // User provided method-only code (LeetCode style). Wrap in static class Solution with trace helpers.
    cleanBody = `    static class Solution {\n${traceHelper}\n${instrumentedBody}\n    }`;
  } else {
    // User provided class(es). Strip any main method and normalize class header.
    let processed = instrumentedBody.replace(
      /public\s+static\s+void\s+main\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/g,
      ''
    );

    const hasSolutionClass = /\bclass\s+Solution\b/.test(processed);
    if (hasSolutionClass) {
      processed = processed.replace(
        /(?:public\s+|private\s+|protected\s+)?class\s+Solution\b/g,
        'static class Solution'
      );
    } else {
      processed = processed.replace(
        /(?:public\s+|private\s+|protected\s+)?class\s+\w+/,
        'static class Solution'
      );
    }

    processed = processed.replace(
      /(^|\n)\s*(?:public\s+|private\s+|protected\s+)?class\s+((?!Solution\b)\w+)/g,
      '$1    static class $2'
    );

    // Inject trace helpers inside Solution class
    processed = processed.replace(/static class Solution\s*\{/, `static class Solution {\n${traceHelper}\n`);

    cleanBody = processed;
  }

  const sig = inspectSignature(userCode, 'java');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'int', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'java', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  const initialVarsPairs = args.map((_, i) => {
    const pName = sig.params[i]?.name || `arg${i}`;
    return `"${pName}", __bb_repr(__bb_a${i}__)`;
  }).join(', ');
  const initialVarsExpr = initialVarsPairs ? `__bb_vars(${initialVarsPairs})` : '"{}"';

  const finalVarsPairs = [
    ...args.map((_, i) => {
      const pName = sig.params[i]?.name || `arg${i}`;
      return `"${pName}", __bb_repr(__bb_a${i}__)`;
    }),
    ...(sig.isVoid ? [] : ['"__result__", __bb_repr(__result__)'])
  ].join(', ');
  const finalVarsExpr = finalVarsPairs ? `__bb_vars(${finalVarsPairs})` : '"{}"';

  const lineCount = Math.max(2, userCode.split('\n').length);

  const invocation = sig.isVoid
    ? `__sol__.${fnName}(${callArgs});`
    : `Object __result__ = __sol__.${fnName}(${callArgs});`;

  return [
    userImports,
    extraImports.join('\n'),
    '',
    'public class Main {',
    traceHelper,
    '',
    JAVA_PREAMBLE,
    '',
    cleanBody,
    '',
    '    public static void main(String[] args) {',
    '        try {',
    argDecls,
    '            Solution __sol__ = new Solution();',
    `            __bb_emit(1, ${initialVarsExpr});`,
    `            ${invocation}`,
    `            __bb_emit(${lineCount}, ${finalVarsExpr});`,
    '            System.err.flush();',
    '        } catch (Exception e) {',
    '            System.err.println("RuntimeError: " + e.getMessage());',
    '        }',
    '    }',
    '}',
  ].join('\n');
}

export function buildCppDriverProgram(userCode: string, inputJson: string | null): string {
  const { headers: userHeaders, body: userBody } = splitCppHeaders(userCode);

  const REQUIRED = [
    '#include <iostream>',
    '#include <vector>',
    '#include <string>',
    '#include <sstream>',
    '#include <map>',
    '#include <unordered_map>',
    '#include <set>',
    '#include <unordered_set>',
    '#include <algorithm>',
    '#include <cmath>',
    '#include <queue>',
    '#include <stack>',
    '#include <initializer_list>',
    '#include <utility>',
  ];

  const existingHeaders = new Set(userHeaders.split('\n').map(l => l.trim()).filter(Boolean));
  const extraHeaders = REQUIRED.filter(h => !existingHeaders.has(h));

  const traceHelper = [
    "// ── BB Trace Helpers ──────────────────────────────────────────",
    "inline std::string __bb_escapeStr(const std::string& s) {",
    "    std::string out;",
    "    for (char c : s) {",
    "        if (c == '\"') out += \"\\\\\\\"\";",
    "        else if (c == '\\\\') out += \"\\\\\\\\\";",
    "        else if (c == '\\n') out += \"\\\\n\";",
    "        else if (c == '\\r') out += \"\\\\r\";",
    "        else if (c == '\\t') out += \"\\\\t\";",
    "        else out += c;",
    "    }",
    "    return out;",
    "}",
    "",
    "template<typename T>",
    "std::string __bb_repr(const T& v) {",
    "    std::ostringstream ss;",
    "    ss << v;",
    "    return ss.str();",
    "}",
    "",
    "inline std::string __bb_repr(bool v) { return v ? \"true\" : \"false\"; }",
    "inline std::string __bb_repr(char v) { std::string s = \"\\\"\"; s += v; s += \"\\\"\"; return s; }",
    "inline std::string __bb_repr(const char* v) { return v ? (\"\\\"\" + __bb_escapeStr(v) + \"\\\"\") : \"null\"; }",
    "inline std::string __bb_repr(const std::string& v) { return \"\\\"\" + __bb_escapeStr(v) + \"\\\"\"; }",
    "inline std::string __bb_repr(ListNode* v) { return serializeList(v); }",
    "inline std::string __bb_repr(TreeNode* v) { return serializeTree(v); }",
    "",
    "template<typename T1, typename T2>",
    "std::string __bb_repr(const std::pair<T1, T2>& p) {",
    "    return \"[\" + __bb_repr(p.first) + \",\" + __bb_repr(p.second) + \"]\";",
    "}",
    "",
    "template<typename T>",
    "std::string __bb_repr(const std::vector<T>& vec) {",
    "    std::string s = \"[\";",
    "    for (size_t i = 0; i < vec.size(); ++i) {",
    "        if (i) s += \",\";",
    "        s += __bb_repr(vec[i]);",
    "    }",
    "    return s + \"]\";",
    "}",
    "",
    "template<typename K, typename V>",
    "std::string __bb_repr(const std::unordered_map<K, V>& m) {",
    "    std::string s = \"{\";",
    "    bool first = true;",
    "    for (const auto& kv : m) {",
    "        if (!first) s += \",\"; first = false;",
    "        s += \"\\\"\" + __bb_escapeStr(__bb_repr(kv.first)) + \"\\\":\" + __bb_repr(kv.second);",
    "    }",
    "    return s + \"}\";",
    "}",
    "",
    "template<typename K, typename V>",
    "std::string __bb_repr(const std::map<K, V>& m) {",
    "    std::string s = \"{\";",
    "    bool first = true;",
    "    for (const auto& kv : m) {",
    "        if (!first) s += \",\"; first = false;",
    "        s += \"\\\"\" + __bb_escapeStr(__bb_repr(kv.first)) + \"\\\":\" + __bb_repr(kv.second);",
    "    }",
    "    return s + \"}\";",
    "}",
    "",
    "template<typename T>",
    "std::string __bb_repr(const std::unordered_set<T>& set) {",
    "    std::string s = \"[\";",
    "    bool first = true;",
    "    for (const auto& x : set) {",
    "        if (!first) s += \",\"; first = false;",
    "        s += __bb_repr(x);",
    "    }",
    "    return s + \"]\";",
    "}",
    "",
    "template<typename T>",
    "std::string __bb_repr(const std::set<T>& set) {",
    "    std::string s = \"[\";",
    "    bool first = true;",
    "    for (const auto& x : set) {",
    "        if (!first) s += \",\"; first = false;",
    "        s += __bb_repr(x);",
    "    }",
    "    return s + \"]\";",
    "}",
    "",
    "inline void __bb_emit(int line, const std::string& vars) {",
    "    std::cout << \"__BB_TRACE__:{\\\"line\\\":\" << line << \",\\\"vars\\\":\" << vars << \"}\" << std::endl;",
    "}",
    "",
    "inline std::string __bb_vars(std::initializer_list<std::pair<const char*, std::string>> kv) {",
    "    std::string s = \"{\";",
    "    bool first = true;",
    "    for (const auto& p : kv) {",
    "        if (!first) s += \",\"; first = false;",
    "        s += \"\\\"\"; s += p.first; s += \"\\\":\"; s += p.second;",
    "    }",
    "    return s + \"}\";",
    "}"
  ].join('\n');

  // Perform multi-step statement-level instrumentation
  const instrumentedBody = instrumentCompiledMethodBody(userBody, 'cpp');

  const sig = inspectSignature(userCode, 'cpp');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'int', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'cpp', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  const initialVarsPairs = args.map((_, i) => {
    const pName = sig.params[i]?.name || `arg${i}`;
    return `{"${pName}", __bb_repr(__bb_a${i}__)}`;
  }).join(', ');
  const initialVarsExpr = initialVarsPairs ? `__bb_vars({${initialVarsPairs}})` : '"{}"';

  const finalVarsPairs = [
    ...args.map((_, i) => {
      const pName = sig.params[i]?.name || `arg${i}`;
      return `{"${pName}", __bb_repr(__bb_a${i}__)}`;
    }),
    ...(sig.isVoid ? [] : ['{"__result__", __bb_repr(__result__)}'])
  ].join(', ');
  const finalVarsExpr = finalVarsPairs ? `__bb_vars({${finalVarsPairs}})` : '"{}"';

  const lineCount = Math.max(2, userCode.split('\n').length);

  const classMatch = userBody.match(/class\s+(\w+)\b/);
  const targetClass = classMatch ? classMatch[1] : null;

  let invocation = '';
  if (targetClass) {
    invocation = sig.isVoid
      ? `${targetClass} __sol__;\n        __sol__.${fnName}(${callArgs});`
      : `${targetClass} __sol__;\n        auto __result__ = __sol__.${fnName}(${callArgs});`;
  } else {
    invocation = sig.isVoid
      ? `${fnName}(${callArgs});`
      : `auto __result__ = ${fnName}(${callArgs});`;
  }

  const mainBlock = `
int main() {
${argDecls}
    __bb_emit(1, ${initialVarsExpr});
    try {
        ${invocation}
        __bb_emit(${lineCount}, ${finalVarsExpr});
    } catch (const std::exception& e) {
        std::cerr << "RuntimeError: " << e.what() << std::endl;
    } catch (...) {
        std::cerr << "RuntimeError: unknown exception" << std::endl;
    }
    return 0;
}`;

  return [
    userHeaders,
    extraHeaders.join('\n'),
    CPP_PREAMBLE,
    '',
    traceHelper,
    'using namespace std;',
    '',
    instrumentedBody,
    mainBlock,
  ].filter(s => s.trim() !== '').join('\n');
}

export function buildGoDriverProgram(userCode: string, inputJson: string | null): string {
  const { packageLine, imports: userImports, body: userBody } = splitGoImports(userCode);

  const REQUIRED_PKGS = ['fmt', 'strings', 'strconv'];
  const mergedImports = `import (\n${REQUIRED_PKGS.map(p => `\t"${p}"`).join('\n')}\n)`;

  const traceHelper = [
    "func __bb_emit(line int, vars string) {",
    "\tfmt.Printf(\"__BB_TRACE__:{\\\"line\\\":%d,\\\"vars\\\":%s}\\n\", line, vars)",
    "}",
    "",
    "func __bb_escapeStr(s string) string {",
    "\ts = strings.ReplaceAll(s, \"\\\\\", \"\\\\\\\\\")",
    "\ts = strings.ReplaceAll(s, \"\\\"\", \"\\\\\\\"\")",
    "\ts = strings.ReplaceAll(s, \"\\n\", \"\\\\n\")",
    "\ts = strings.ReplaceAll(s, \"\\r\", \"\\\\r\")",
    "\ts = strings.ReplaceAll(s, \"\\t\", \"\\\\t\")",
    "\treturn s",
    "}",
    "",
    "func __bb_repr(v interface{}) string {",
    "\tif v == nil {",
    "\t\treturn \"null\"",
    "\t}",
    "\tswitch val := v.(type) {",
    "\tcase *ListNode:",
    "\t\treturn serializeList(val)",
    "\tcase *TreeNode:",
    "\t\treturn serializeTree(val)",
    "\tcase string:",
    "\t\treturn \"\\\"\" + __bb_escapeStr(val) + \"\\\"\"",
    "\tcase bool:",
    "\t\tif val {",
    "\t\t\treturn \"true\"",
    "\t\t}",
    "\t\treturn \"false\"",
    "\tcase int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:",
    "\t\treturn fmt.Sprintf(\"%d\", val)",
    "\tcase float32, float64:",
    "\t\treturn fmt.Sprintf(\"%g\", val)",
    "\tcase []int:",
    "\t\tparts := make([]string, len(val))",
    "\t\tfor i, x := range val {",
    "\t\t\tparts[i] = fmt.Sprintf(\"%d\", x)",
    "\t\t}",
    "\t\treturn \"[\" + strings.Join(parts, \",\") + \"]\"",
    "\tcase []string:",
    "\t\tparts := make([]string, len(val))",
    "\t\tfor i, x := range val {",
    "\t\t\tparts[i] = \"\\\"\" + __bb_escapeStr(x) + \"\\\"\"",
    "\t\t}",
    "\t\treturn \"[\" + strings.Join(parts, \",\") + \"]\"",
    "\tcase []bool:",
    "\t\tparts := make([]string, len(val))",
    "\t\tfor i, x := range val {",
    "\t\t\tif x {",
    "\t\t\t\tparts[i] = \"true\"",
    "\t\t\t} else {",
    "\t\t\t\tparts[i] = \"false\"",
    "\t\t\t}",
    "\t\t}",
    "\t\treturn \"[\" + strings.Join(parts, \",\") + \"]\"",
    "\tcase [][]int:",
    "\t\trows := make([]string, len(val))",
    "\t\tfor i, row := range val {",
    "\t\t\tparts := make([]string, len(row))",
    "\t\t\tfor j, x := range row {",
    "\t\t\t\tparts[j] = fmt.Sprintf(\"%d\", x)",
    "\t\t\t}",
    "\t\t\trows[i] = \"[\" + strings.Join(parts, \",\") + \"]\"",
    "\t\t}",
    "\t\treturn \"[\" + strings.Join(rows, \",\") + \"]\"",
    "\tcase map[int]int:",
    "\t\tvar parts []string",
    "\t\tfor k, v := range val {",
    "\t\t\tparts = append(parts, fmt.Sprintf(\"\\\"%d\\\":%d\", k, v))",
    "\t\t}",
    "\t\treturn \"{\" + strings.Join(parts, \",\") + \"}\"",
    "\tcase map[string]int:",
    "\t\tvar parts []string",
    "\t\tfor k, v := range val {",
    "\t\t\tparts = append(parts, fmt.Sprintf(\"\\\"%s\\\":%d\", __bb_escapeStr(k), v))",
    "\t\t}",
    "\t\treturn \"{\" + strings.Join(parts, \",\") + \"}\"",
    "\tdefault:",
    "\t\treturn fmt.Sprintf(\"%v\", val)",
    "\t}",
    "}",
    "",
    "func __bb_vars(pairs ...string) string {",
    "\tvar sb strings.Builder",
    "\tsb.WriteString(\"{\")",
    "\tfor i := 0; i+1 < len(pairs); i += 2 {",
    "\t\tif i > 0 {",
    "\t\t\tsb.WriteString(\",\")",
    "\t\t}",
    "\t\tsb.WriteString(\"\\\"\" + pairs[i] + \"\\\":\" + pairs[i+1])",
    "\t}",
    "\tsb.WriteString(\"}\")",
    "\treturn sb.String()",
    "}"
  ].join('\n');

  // Perform multi-step statement-level instrumentation
  const instrumentedBody = instrumentCompiledMethodBody(userBody, 'go');

  const sig = inspectSignature(userCode, 'go');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'int', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'go', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  const initialVarsPairs = args.map((_, i) => {
    const pName = sig.params[i]?.name || `arg${i}`;
    return `"${pName}", __bb_repr(__bb_a${i}__)`;
  }).join(', ');
  const initialVarsExpr = initialVarsPairs ? `__bb_vars(${initialVarsPairs})` : '"{}"';

  const finalVarsPairs = [
    ...args.map((_, i) => {
      const pName = sig.params[i]?.name || `arg${i}`;
      return `"${pName}", __bb_repr(__bb_a${i}__)`;
    }),
    ...(sig.isVoid ? [] : ['"__result__", __bb_repr(__result__)'])
  ].join(', ');
  const finalVarsExpr = finalVarsPairs ? `__bb_vars(${finalVarsPairs})` : '"{}"';

  const lineCount = Math.max(2, userCode.split('\n').length);

  const invocation = sig.isVoid
    ? `${fnName}(${callArgs})`
    : `__result__ := ${fnName}(${callArgs})`;

  const mainFn = `
func main() {
${argDecls}
\t__bb_emit(1, ${initialVarsExpr})
\t${invocation}
\t__bb_emit(${lineCount}, ${finalVarsExpr})
}
`;

  return [
    packageLine || 'package main',
    '',
    mergedImports,
    GO_PREAMBLE,
    '',
    traceHelper,
    instrumentedBody,
    mainFn,
  ].join('\n');
}

export function buildRustDriverProgram(userCode: string, inputJson: string | null): string {
  const { uses: userUses, body: userBody } = splitRustUses(userCode);

  const hasImplSolution = /impl\s+Solution\b/.test(userBody);
  const hasStructSolution = /struct\s+Solution\b/.test(userBody);
  const prefixStruct = (hasImplSolution && !hasStructSolution) ? 'struct Solution;\n' : '';

  const traceHelper = `
macro_rules! bb_emit {
    (\$line:expr, \$vars:expr) => {
        println!("__BB_TRACE__:{{\\"line\\":{},\\"vars\\":{}}}", \$line, \$vars);
    };
}

fn bb_escape_str(s: &str) -> String {
    s.replace('\\\\', "\\\\\\\\")
     .replace('"', "\\\\\"")
     .replace('\\n', "\\\\n")
     .replace('\\r', "\\\\r")
     .replace('\\t', "\\\\t")
}

fn bb_repr<T: std::fmt::Debug>(v: &T) -> String {
    let s = format!("{:?}", v);
    if s.starts_with('"') && s.ends_with('"') {
        s
    } else if s == "true" || s == "false" || s.chars().all(|c| c.is_ascii_digit() || c == '-' || c == '.') {
        s
    } else if s.starts_with('[') && s.ends_with(']') {
        s
    } else if s.starts_with("Some(") && s.ends_with(')') {
        s
    } else if s == "None" {
        "null".to_string()
    } else {
        format!("\"{}\"", bb_escape_str(&s))
    }
}

fn bb_vars(pairs: &[(&str, String)]) -> String {
    let mut parts = Vec::new();
    for (k, v) in pairs {
        parts.push(format!("\"{}\":{}", k, v));
    }
    format!("{{{}}}", parts.join(","))
}
`;

  // Perform multi-step statement-level instrumentation
  const instrumentedBody = instrumentCompiledMethodBody(userBody, 'rust');

  const sig = inspectSignature(userCode, 'rust');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'i32', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'rust', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  const initialVarsPairs = args.map((_, i) => {
    const pName = sig.params[i]?.name || `arg${i}`;
    return `("${pName}", bb_repr(&__bb_a${i}__))`;
  }).join(', ');
  const initialVarsExpr = initialVarsPairs ? `&bb_vars(&[${initialVarsPairs}])` : '"{}".to_string()';

  const finalVarsPairs = [
    ...args.map((_, i) => {
      const pName = sig.params[i]?.name || `arg${i}`;
      return `("${pName}", bb_repr(&__bb_a${i}__))`;
    }),
    ...(sig.isVoid ? [] : ['("__result__", bb_repr(&__result__))'])
  ].join(', ');
  const finalVarsExpr = finalVarsPairs ? `&bb_vars(&[${finalVarsPairs}])` : '"{}".to_string()';

  const lineCount = Math.max(2, userCode.split('\n').length);

  let invocation = '';
  if (hasImplSolution) {
    invocation = sig.isVoid
      ? `Solution::${fnName}(${callArgs});`
      : `let __result__ = Solution::${fnName}(${callArgs});`;
  } else {
    invocation = sig.isVoid
      ? `${fnName}(${callArgs});`
      : `let __result__ = ${fnName}(${callArgs});`;
  }

  const mainFn = `
fn main() {
${argDecls}
    bb_emit!(1, ${initialVarsExpr});
    ${invocation}
    bb_emit!(${lineCount}, ${finalVarsExpr});
}
`;

  return [
    userUses,
    prefixStruct,
    RUST_PREAMBLE,
    traceHelper,
    instrumentedBody,
    mainFn,
  ].filter(s => s.trim() !== '').join('\n');
}

export function extractParamCount(code: string, lang: SupportedLang): number {
  const sig = inspectSignature(code, lang);
  return sig.params.length || 0;
}

