-- News articles table for RSS aggregation
-- Run after 001_initial.sql and 002_add_football_sport.sql

CREATE TABLE news_articles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(500)  NOT NULL,
    summary         TEXT,
    content_snippet TEXT,
    source          VARCHAR(100)  NOT NULL,
    source_url      VARCHAR(1000) NOT NULL UNIQUE,
    image_url       VARCHAR(1000),
    category        VARCHAR(50)  NOT NULL DEFAULT 'general',
    sport           VARCHAR(50),
    leagues         JSONB,
    teams           JSONB,
    players         JSONB,
    published_at    TIMESTAMPTZ   NOT NULL,
    fetched_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    trending_score  DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_breaking     BOOLEAN       NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE INDEX ix_news_published ON news_articles(published_at);
CREATE INDEX ix_news_category ON news_articles(category);
CREATE INDEX ix_news_sport ON news_articles(sport);
CREATE INDEX ix_news_trending ON news_articles(trending_score);
CREATE UNIQUE INDEX ix_news_source_url ON news_articles(source_url);
