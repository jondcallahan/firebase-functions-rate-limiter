/* tslint:disable:max-classes-per-file */
import * as firebase from "@firebase/testing";
import { expect, use as chaiUse } from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as _ from "lodash";
import "mocha";
import * as sinon from "sinon";
import * as uuid from "uuid/v4";

import { FirestorePersistenceProvider } from "./FirestorePersistenceProvider";
import { PersistenceProvider } from "./PersistenceProvider";
import { PersistenceRecord } from "./PersistenceRecord";
import { RealtimeDbPersistenceProvider } from "./RealtimeDbPersistenceProvider";
chaiUse(chaiAsPromised);

function mock() {
    const app = firebase.initializeTestApp({ projectId: "unit-testing-" + Date.now(), databaseName: "db" });
    const uniqueCollectionName = uuid();
    const uniqueDocName = uuid();
    const firestore = app.firestore();
    const database = app.database();
    const provider: PersistenceProvider = undefined as any;
    const emptyPersistenceRecord: PersistenceRecord = { usages: [] };
    const nonModifyingUpdater = (pr: PersistenceRecord) => pr;
    return {
        app,
        firestore,
        database,
        uniqueCollectionName,
        uniqueDocName,
        provider,
        emptyPersistenceRecord,
        nonModifyingUpdater,
    };
}

const mockFirestoreProvider: typeof mock = () => {
    const mockResult = mock();
    const provider = new FirestorePersistenceProvider(mockResult.firestore);
    return { ...mockResult, provider };
};

const mockRealtimeProvider: typeof mock = () => {
    const mockResult = mock();
    const provider = new RealtimeDbPersistenceProvider(mockResult.database);
    return { ...mockResult, provider };
};

afterEach(async () => {
    await Promise.all(firebase.apps().map(app => app.delete()));
});

before("startup", async function() {
    this.timeout(4000);
    const { firestore, database } = mock();
    await firestore
        .collection("a")
        .doc("a")
        .get();
    await database.ref("a").set({ a: "a" });
});

[
    { name: "FirestorePersistenceProvider", mockFactory: mockFirestoreProvider },
    { name: "RealtimeDbPersistenceProvider", mockFactory: mockRealtimeProvider },
].forEach(test =>
    describe(test.name, () => {
        it("Runs transaction code", async () => {
            const { provider, uniqueCollectionName, uniqueDocName, emptyPersistenceRecord } = test.mockFactory();
            const spy = sinon.spy();
            await provider.updateAndGet(uniqueCollectionName, uniqueDocName, record => {
                spy();
                return emptyPersistenceRecord;
            });
            expect(spy.callCount).to.be.equal(1);
        });

        it("Resolves when transaction callback is finshed", async () => {
            const { provider, uniqueCollectionName, uniqueDocName, emptyPersistenceRecord } = test.mockFactory();
            const spy = sinon.spy();
            await provider.updateAndGet(uniqueCollectionName, uniqueDocName, record => {
                spy();
                return { usages: [] };
            });
            expect(spy.callCount).to.be.equal(1);
        });

        it("Returns empty record when no data", async () => {
            const { provider, uniqueCollectionName, uniqueDocName, nonModifyingUpdater } = test.mockFactory();
            const rec = await provider.updateAndGet(uniqueCollectionName, uniqueDocName, nonModifyingUpdater);
            expect(rec.usages)
                .to.be.an("array")
                .with.length(0);
        });

        it("Saves record properly", async () => {
            const { provider, uniqueCollectionName, uniqueDocName, nonModifyingUpdater } = test.mockFactory();

            const recToBeSaved: PersistenceRecord = {
                usages: [1, 2, 3],
            };
            await provider.updateAndGet(uniqueCollectionName, uniqueDocName, r => recToBeSaved);

            const recRetrived = await provider.updateAndGet(uniqueCollectionName, uniqueDocName, nonModifyingUpdater);
            expect(recRetrived.usages)
                .to.be.an("array")
                .with.length(recToBeSaved.usages.length)
                .that.have.members(recToBeSaved.usages);
        });
    }),
);