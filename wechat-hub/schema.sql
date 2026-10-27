-- ==============================================================================
-- 公众号新人互助互关平台 (WeChat Follow Hub) - Supabase 数据库全套建表脚本
-- 包含：号主信息表 + 双向交叉验证关注关系表 + 图片存储桶
-- 在 Supabase 后台 -> SQL Editor 中粘贴并点击 Run 即可完成
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

alter table public.wechat_accounts enable row level security;

create policy "Allow public read" on public.wechat_accounts for select using (true);
create policy "Allow public insert" on public.wechat_accounts for insert with check (true);
create policy "Allow public update followers" on public.wechat_accounts for update using (true);
create policy "Allow public delete" on public.wechat_accounts for delete using (true);

-- 2. 创建【双向交叉验证】关注关系表 (核心：谁关注了谁)
create table if not exists public.follow_relations (
  id bigint generated always as identity primary key,
  created_at timestamptz default now() not null,
  follower_name text not null,  -- 发起关注的号主名称
  target_name text not null,    -- 被关注的目标号主名称
  unique(follower_name, target_name) -- 防止重复记录
);

alter table public.follow_relations enable row level security;

create policy "Allow read relations" on public.follow_relations for select using (true);
create policy "Allow insert relations" on public.follow_relations for insert with check (true);
create policy "Allow delete relations" on public.follow_relations for delete using (true);

-- 3. 创建用于存放二维码图片的存储桶 (Storage Bucket)
insert into storage.buckets (id, name, public)
values ('qr-codes', 'qr-codes', true)
on conflict (id) do nothing;

create policy "Public Access to QR Codes" on storage.objects for select using ( bucket_id = 'qr-codes' );
create policy "Public Upload QR Codes" on storage.objects for insert with check ( bucket_id = 'qr-codes' );
