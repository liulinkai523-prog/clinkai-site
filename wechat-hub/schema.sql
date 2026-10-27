-- ==============================================================================
-- 公众号新人互助互关平台 (WeChat Follow Hub) - Supabase 数据库一键初始化脚本
-- 在 Supabase 后台 -> SQL Editor 中粘贴并点击 Run 即可一键完成建表与权限配置
-- ==============================================================================

-- 1. 创建号主信息数据表
create table if not exists public.wechat_accounts (
  id bigint generated always as identity primary key,
  created_at timestamptz default now() not null,
  name text not null,
  category text not null,
  category_label text not null,
  bio text not null,
  wechat text default '未公开',
  qr_url text not null,
  avatar_letter text default '号',
  avatar_grad text default 'from-brand-500 to-emerald-600',
  followers_count int default 1
);

-- 2. 启用行级安全机制 (Row Level Security, RLS)
alter table public.wechat_accounts enable row level security;

-- 3. 创建公开读取权限：所有人都可以浏览所有号主卡片
create policy "Allow public read"
  on public.wechat_accounts
  for select
  using (true);

-- 4. 创建公开插入权限：任何用户都可以上传自己的公众号
create policy "Allow public insert"
  on public.wechat_accounts
  for insert
  with check (true);

-- 5. 允许所有人增加互助热度 (Update)
create policy "Allow public update followers"
  on public.wechat_accounts
  for update
  using (true);

-- 6. 创建存储桶 (Storage Bucket) 用于存放二维码图片文件
-- 如果你使用的是 Supabase Dashboard，也可以直接在 Storage -> Create new bucket -> 名称填 'qr-codes' 并勾选 Public bucket
insert into storage.buckets (id, name, public)
values ('qr-codes', 'qr-codes', true)
on conflict (id) do nothing;

-- 7. 开放二维码图片的公开上传与读取策略
create policy "Public Access to QR Codes"
  on storage.objects for select
  using ( bucket_id = 'qr-codes' );

create policy "Public Upload QR Codes"
  on storage.objects for insert
  with check ( bucket_id = 'qr-codes' );

-- 8. 插入几条初始种子测试数据 (可选)
insert into public.wechat_accounts (name, category, category_label, bio, wechat, qr_url, avatar_letter, followers_count)
values 
  ('Linkai 的思考实验', 'ai', '🤖 AI/科技', '聚焦大模型企业落地与独立开发实操，新人号主求支持，关注必秒回！', 'linkai_liu', '', '凯', 128),
  ('AI极客先锋', 'ai', '🤖 AI/科技', '专注Agent智能体与自动化工具流，日更原创干货，24h内必回关！', 'geeker_ai', '', 'AI', 356),
  ('独立开发搞钱日常', 'sidehustle', '💼 副业搞钱', '从0到1记录独立产品开发与自媒体出海变现，真实数据复盘。', 'indie_dev_lab', '', '工', 412)
on conflict do nothing;
