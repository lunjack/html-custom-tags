基本语法

标题

使用 # 符号来表示标题，数量从 1 到 6 对应 HTML 的 \<h1> 到 \<h6>。

# 这是一级标题 (H1) 3
## 这是二级标题 (H2)
### 这是三级标题 (H3) 1
#### 这是四级标题 (H4) 
##### 这是五级标题 (H5) 棕
###### 这是六级标题 (H6) 灰

---
### 段落与换行

- 创建一个段落，只需用一个或多个空行分隔文本行。


- 在行末添加两个空格再按回车，即可实现换行（<br>）。直接按回车通常只会产生一个空格。


- 这是第一个段落。它有两句话。



- 这是第二个段落。  

- 这是强制换行后的同一段内容。

---
### 强调

>这是 **粗体** 文字。
这是 *斜体* 文字。
这是 ***粗斜体*** 文字。

---
### 有序列表 (Ordered List):

使用数字序号加上一个点和空格。

1. 第一项

2. 第二项

3. 第三项

---
### 无序列表 (Unordered List):

使用 -, *, 或 + 加上一个空格。

- 项目一

- 项目二

&nbsp; - 子项目二A (缩进两个或四个空格)

&nbsp; - 子项目二B

---
### 链接

#### 行内链接 (Inline Link):

- 访问 [Google](https://www.google.com) 搜索。

- 访问 [OpenAI](https://www.openai.com "AI研究组织") 了解更多。


#### 引用式链接 (Reference Link):

&nbsp; &nbsp; &nbsp;适合在文档中多次使用同一个链接。

 - [引用链接][lunjack测试]

[lunjack测试]: https://www.google.com "这是引用链接测试"

---
### 图片

- 插入图片的语法类似于链接，只是在前面加一个感叹号 !。

![Markdown标志](https://markdown-here.com/img/icon256.png "Markdown Logo")

---
### 代码

- 行内代码 (Inline Code):

> - 用反引号包裹短代码或代码片段。

> - 使用 `console.log()` 函数来打印信息。

---
### 引用

- 使用大于符号来表示块引用。

> 这是一个块引用。

> 这是引用的第二行。

>

> > 这是一个嵌套的引用。

>

> - 引用中也可以使用其他Markdown语法。

---
### 分隔线

&nbsp; &nbsp; &nbsp;使用三个或多个连字符 ---、三个星号或三个下划线来创建一条水平分隔线。行上不能有其他内容。


- 上面的内容

---

- 下面的内容

---
### 表格

&nbsp; &nbsp; &nbsp;使用连字符来分隔表头，使用管道符来分隔列,对齐方式由冒号位置决定。
| <span style="padding: 0px 30px 0px 0px;">左对齐</span> | <span style="padding: 0px 30px;">居中对齐</span> |<span style="padding: 0px 0px 30px 0px ; ">右对齐</span> |
| :------- | :------: | ------: |
| 单元格123 |  单元格456  | 单元格789 |
| 单元格 |  单元格  | 单元格 |


---
### 代码块

&nbsp; &nbsp; &nbsp;用三个反引号 ````` 包裹多行代码，并可在开始处指定语言名称以实现语法高亮。

```
javascript 
function fancyAlert(arg) { if(arg) { $.facebox({div:'#foo'}) } } 
``` 
```
python def hello\_world(): print("Hello, World!")
``` 

---
### 任务列表(并非原生)

&nbsp; &nbsp; &nbsp;使用 - [ ] 表示未完成任务，- [x] 表示已完成任务。

- [x] 编写 Markdown 手册

- [ ] 发布到博客

- [ ] 分享给朋友


---
### 删除线

&nbsp; &nbsp; &nbsp;使用两个波浪号包裹文本。

- 原价：~~¥999~~ 现价：¥599


---
### 自动链接

&nbsp; &nbsp; &nbsp;直接用尖括号 < > 包裹 URL 或邮箱地址，它会自动转换为可点击的链接。

- <https://www.example.com>

- <fake@example.com>