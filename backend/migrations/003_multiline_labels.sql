-- 标记按换行保存，兼容原有单项值；为多项标记扩展容量，不改写已有内容。
ALTER TABLE contents MODIFY COLUMN label VARCHAR(1000) NOT NULL DEFAULT '';
