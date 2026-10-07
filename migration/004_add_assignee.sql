alter table leads add column next_action_assignee uuid references profiles(id);
alter table fractional_leaders add column next_action_assignee uuid references profiles(id);
alter table training_partners add column next_action_assignee uuid references profiles(id);
