// create supabase client

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://eshwntsgsputksqamckh.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzaHdudHNnc3B1dGtzcWFtY2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMwMDg5ODQsImV4cCI6MjA0ODU4NDk4NH0.t91Xc-BK_7hYpTxVIGNQRAolBVAZBs4POdcQXH8rLS4"
);

export default supabase;
