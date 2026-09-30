"""Comments/labels: guarded real PostgreSQL, HTTP security, and migration behavior."""
from datetime import datetime, timezone
from pathlib import Path
from secrets import token_urlsafe
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import event, inspect, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from app.models import Comment, Label, IssueLabel, Issue, UserSession


@pytest.fixture
def work(client):
    credentials = {"email": "organizer@example.com", "password": token_urlsafe(24)}
    user = client.post("/api/auth/register", json={**credentials, "display_name": "Organizer"}).json()
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    project = client.post("/api/projects", json={"name": "Organization"}).json()
    root = f"/api/projects/{project['id']}"
    issue = client.post(root + "/issues", json={"title": "Issue"}).json()
    return credentials, user, project, issue, root, f"{root}/issues/{issue['id']}/comments"


def test_comment_create_edit_delete_persistence_and_noop(client, work, clean_database):
    credentials, user, project, issue, root, path = work
    result = client.post(path, json={"body": "  <script>plain text</script>\nNext line  "})
    assert result.status_code == 201
    row = result.json(); url = f"{path}/{row['id']}"
    assert row["body"] == "<script>plain text</script>\nNext line"
    assert row["author"] == {"id": user["id"], "display_name": "Organizer"} and not row["edited"]
    assert client.patch(url, json={"body": row["body"]}).json() == row
    edited = client.patch(url, json={"body": "Revised"}).json()
    assert edited["edited"] and edited["created_at"] == row["created_at"]
    clean_database.dispose()
    with Session(clean_database) as db:
        assert db.get(Comment, UUID(row["id"])).body == "Revised"
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(url).json() == edited
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 404
    assert client.get(path).json() == {"items": [], "has_more": False}
    assert client.get(root + f"/issues/{issue['id']}").status_code == 200


@pytest.mark.parametrize("body", [{}, {"body": None}, {"body": " \n\t"}, {"body": "x" * 5001},
    {"body": 1}, {"body": "valid", "author_id": str(uuid4())}, {"body": "valid", "issue_id": str(uuid4())}])
def test_comment_validation(client, work, body):
    path = work[-1]
    row = client.post(path, json={"body": "Original"}).json()
    assert client.post(path, json=body).status_code == 422
    assert client.patch(f"{path}/{row['id']}", json=body).status_code == 422
    assert client.get(path).json()["items"] == [row]


@pytest.mark.parametrize("body", [{}, {"name": None}, {"name": " \t"}, {"name": "x" * 31}, {"name": 1},
    {"name": "Valid", "color": "#fff"}, {"name": "Valid", "color": None}, {"name": "Valid", "project_id": str(uuid4())}])
def test_label_validation(client, work, body):
    path = work[-2] + "/labels"
    row = client.post(path, json={"name": "Original"}).json()
    assert client.post(path, json=body).status_code == 422
    assert client.patch(f"{path}/{row['id']}", json=body).status_code == 422
    assert client.get(path).json()["items"] == [row]


def test_labels_unique_assignment_rename_delete_and_persistence(client, work, clean_database):
    credentials, _, _, issue, root, _ = work
    path = root + "/labels"
    a = client.post(path, json={"name": "  Frontend  ", "color": "purple"}).json()
    assert a["name"] == "Frontend"
    duplicate = client.post(path, json={"name": "FRONTEND"})
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "label_name_taken"
    b = client.post(path, json={"name": "Backend"}).json()
    assert client.patch(f"{path}/{b['id']}", json={"name": "frontend"}).status_code == 409
    assert client.get(f"{path}/{b['id']}").json() == b
    assignment = f"{root}/issues/{issue['id']}/labels/{a['id']}"
    for _ in range(2): assert client.put(assignment).json() == [a]
    renamed = client.patch(f"{path}/{a['id']}", json={"name": "UI", "color": "green"}).json()
    assert client.get(root + "/issues").json()["items"][0]["labels"] == [renamed]
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(f"{root}/issues/{issue['id']}").json()["labels"] == [renamed]
    for _ in range(2): assert client.delete(assignment).json() == []
    client.put(assignment)
    assert client.delete(f"{path}/{a['id']}").status_code == 204
    assert client.delete(f"{path}/{a['id']}").status_code == 404
    assert client.get(f"{root}/issues/{issue['id']}").json()["labels"] == []
    with Session(clean_database) as db:
        assert db.get(Issue, UUID(issue["id"])) is not None
        assert list(db.scalars(select(IssueLabel))) == []


def test_paging_and_boundaries(client, work, clean_database):
    _, user, project, issue, root, path = work
    assert client.post(path, json={"body": "x" * 5000}).status_code == 201
    assert client.post(root + "/labels", json={"name": "x" * 30}).status_code == 201
    tied = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with Session(clean_database) as db:
        db.add_all([Comment(issue_id=UUID(issue["id"]), author_id=UUID(user["id"]), body=f"Comment {i}", created_at=tied) for i in range(25)])
        db.add_all([Label(project_id=UUID(project["id"]), name=f"Label {i:02}") for i in range(25)])
        db.commit()
    for route in [path, root + "/labels"]:
        a = client.get(route + "?limit=20&offset=0").json()
        b = client.get(route + "?limit=20&offset=20").json()
        assert len(a["items"]) == 20 and a["has_more"] and len(b["items"]) == 6 and not b["has_more"]
        assert len({row["id"] for row in a["items"] + b["items"]}) == 26
        for query in ["limit=0", "limit=101", "offset=-1"]: assert client.get(route + "?" + query).status_code == 422
    rows = client.get(path + "?limit=100").json()["items"]
    assert [row["id"] for row in rows[:25]] == sorted(row["id"] for row in rows[:25])
    assert rows[-1]["body"] == "x" * 5000


def endpoints(client, work):
    root, path = work[-2:]
    c = client.post(path, json={"body": "Kept"}).json()
    label = client.post(root + "/labels", json={"name": "Kept"}).json()
    assignment = f"{root}/issues/{work[3]['id']}/labels/{label['id']}"
    client.put(assignment)
    return [("POST", path, {"body": "Denied"}), ("PATCH", f"{path}/{c['id']}", {"body": "Denied"}),
            ("DELETE", f"{path}/{c['id']}", None), ("POST", root + "/labels", {"name": "Denied"}),
            ("PATCH", f"{root}/labels/{label['id']}", {"name": "Denied"}), ("DELETE", f"{root}/labels/{label['id']}", None),
            ("PUT", assignment, None), ("DELETE", assignment, None)]


@pytest.mark.parametrize("mode,expected", [("archived",409), ("foreign",404), ("signed_out",401), ("expired",401), ("csrf",403)])
def test_every_write_security_and_archival(client, work, clean_database, mode, expected):
    routes = endpoints(client, work)
    if mode == "archived": client.post(work[-2] + "/archive", json={})
    elif mode == "foreign":
        client.post("/api/auth/logout")
        credentials = {"email": "other-organizer@example.com", "password": token_urlsafe(24)}
        client.post("/api/auth/register", json={**credentials, "display_name": "Other"})
        client.post("/api/auth/login", json=credentials)
    elif mode == "signed_out": client.cookies.clear()
    elif mode == "expired":
        with clean_database.begin() as db: db.execute(update(UserSession).values(expires_at=datetime(2000, 1, 1, tzinfo=timezone.utc)))
    else: client.headers["Origin"] = "https://untrusted.example"
    for method, url, payload in routes:
        result = client.request(method, url, **({"json":payload} if payload else {}))
        assert result.status_code == expected, (method, url, result.text)
        assert "error" in result.json() and result.headers["cache-control"] == "no-store"
    for url in [work[-1], work[-2]+"/labels", routes[1][1], routes[4][1]]:
        assert client.get(url).status_code == (200 if mode in {"archived", "csrf"} else expected)
    if mode == "archived":
        client.post(work[-2]+"/restore", json={})
        assert client.patch(routes[1][1],json={"body":"Restored"}).status_code == 200


def test_cross_project_assignments_and_direct_ids(client, work, clean_database):
    root, path = work[-2:]
    other = client.post("/api/projects", json={"name":"Other"}).json()
    other_root = f"/api/projects/{other['id']}"
    label = client.post(other_root+"/labels",json={"name":"Foreign label"}).json()
    assert client.put(f"{root}/issues/{work[3]['id']}/labels/{label['id']}").status_code == 404
    assert client.get(f"{root}/labels/{label['id']}").status_code == 404
    c = client.post(path,json={"body":"Original"}).json()
    second = client.post(root+"/issues",json={"title":"Other issue"}).json()
    for method in ["GET","PATCH","DELETE"]:
        assert client.request(method,f"{root}/issues/{second['id']}/comments/{c['id']}",**({"json":{"body":"Denied"}} if method=="PATCH" else {})).status_code == 404
    with clean_database.connect() as db:
        tx=db.begin()
        try:
            with pytest.raises(DBAPIError): db.execute(IssueLabel.__table__.insert().values(issue_id=UUID(work[3]["id"]),label_id=UUID(label["id"]),project_id=UUID(work[2]["id"])))
        finally: tx.rollback()


def test_comment_author_enforced(client, work, clean_database):
    c=client.post(work[-1],json={"body":"Original"}).json()
    other=client.post("/api/auth/register",json={"email":"author@example.com","password":token_urlsafe(24),"display_name":"Other author"}).json()
    with clean_database.begin() as db: db.execute(update(Comment).values(author_id=UUID(other["id"])))
    url=f"{work[-1]}/{c['id']}"
    assert client.get(url).status_code == 200
    assert client.patch(url,json={"body":"Denied"}).status_code == 404
    assert client.delete(url).status_code == 404


def test_labels_batched_for_board_and_new_methods_cors(client, work, clean_database):
    with Session(clean_database) as db:
        db.add_all([Issue(project_id=UUID(work[2]["id"]),title=f"Issue {i}") for i in range(30)])
        db.commit()
    statements=[]
    def capture(_c,_cur,statement,_params,_context,_many): statements.append(statement)
    event.listen(clean_database,"before_cursor_execute",capture)
    try: result=client.get(work[-2]+"/issues?limit=100")
    finally: event.remove(clean_database,"before_cursor_execute",capture)
    assert result.status_code==200 and len(result.json()["items"])==31
    assert len([s for s in statements if "JOIN labels" in s])==1
    for method in ["PUT","DELETE"]:
        response=client.options(work[-1],headers={"Origin":"http://localhost:3000","Access-Control-Request-Method":method})
        assert response.status_code==200 and method in response.headers["access-control-allow-methods"]


@pytest.mark.parametrize("table,values",[("comment",{"body":""}),("comment",{"body":"x"*5001}),
    ("label",{"name":" "}),("label",{"name":"x"*31}),("label",{"color":"invalid"})])
def test_database_constraints(client,work,clean_database,table,values):
    target=Comment if table=="comment" else Label
    data={"id":uuid4(),**({"issue_id":UUID(work[3]["id"]),"author_id":UUID(work[1]["id"]),"body":"Valid"} if table=="comment" else {"project_id":UUID(work[2]["id"]),"name":"Valid","color":"blue"}),**values}
    with clean_database.connect() as db:
        tx=db.begin()
        try:
            with pytest.raises(DBAPIError): db.execute(target.__table__.insert().values(**data))
        finally: tx.rollback()


def test_migration_preserves_existing_rows(client, work, clean_database):
    endpoints(client,work)
    cfg=Config(str(Path(__file__).resolve().parents[1]/"alembic.ini"))
    with clean_database.connect() as db:
        before={table:db.execute(text(f"SELECT * FROM {table} ORDER BY id")).all() for table in ["users","sessions","projects","issues"]}
    command.check(cfg)
    command.downgrade(cfg,"0005_create_issues")
    try:
        assert all(not inspect(clean_database).has_table(table) for table in ["comments","labels","issue_labels"])
        with clean_database.connect() as db:
            for table,rows in before.items(): assert db.execute(text(f"SELECT * FROM {table} ORDER BY id")).all()==rows
    finally: command.upgrade(cfg,"head")
    command.check(cfg)
    assert client.get(work[-1]).json()["items"]==[]
    assert client.get(work[-2]+"/issues").json()["items"][0]["labels"]==[]
