'use strict';

jest.mock('../../../utils/documents');
jest.mock('../../../utils/packages');
jest.mock('fs/promises');
jest.mock('path');

const { getWorkspaceFolder } =
	/** @type {jest.Mocked<typeof import('../../../utils/documents')>} */ (
		require('../../../utils/documents')
	);

const { findPackageRoot } = /** @type {jest.Mocked<typeof import('../../../utils/packages')>} */ (
	require('../../../utils/packages')
);

const fs = /** @type {tests.mocks.FSPromisesModule} */ (require('fs/promises'));

const path = /** @type {tests.mocks.PathModule} */ (require('path'));

const { OldStylelintWarningModule } = require('../old-stylelint-warning');

const mockContext = {
	connection: {
		window: {
			showWarningMessage: jest.fn(),
			showDocument: jest.fn(),
		},
	},
	documents: { onDidOpen: jest.fn() },
	options: { validate: /** @type {string[]} */ ([]) },
	displayError: jest.fn(),
	resolveStylelint: jest.fn(),
};

const mockLogger = /** @type {jest.Mocked<winston.Logger>} */ (
	/** @type {any} */ ({
		debug: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})
);

const getParams = (passLogger = false) =>
	/** @type {LanguageServerModuleConstructorParameters} */ (
		/** @type {any} */
		({
			context: mockContext,
			logger: passLogger ? mockLogger : undefined,
		})
	);

describe('OldStylelintWarningModule', () => {
	beforeEach(() => {
		path.__mockPlatform('posix');
		mockContext.options.validate = [];
		jest.clearAllMocks();
	});

	test('should be constructable', () => {
		expect(() => new OldStylelintWarningModule(getParams())).not.toThrow();
	});

	test('onDidRegisterHandlers should register an onDidOpen handler', () => {
		const module = new OldStylelintWarningModule(getParams());

		module.onDidRegisterHandlers();

		expect(mockContext.documents.onDidOpen).toHaveBeenCalledTimes(1);
		expect(mockContext.documents.onDidOpen).toHaveBeenCalledWith(expect.any(Function));
	});

	test('if document language ID is not in options, should not warn', async () => {
		mockContext.options.validate = ['baz'];

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).not.toHaveBeenCalled();
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenLastCalledWith(
			'Document should not be validated, ignoring',
			{ uri: 'foo', language: 'bar' },
		);
	});

	test('if document is not part of a workspace, should not warn', async () => {
		getWorkspaceFolder.mockResolvedValue(undefined);
		mockContext.options.validate = ['bar'];

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).not.toHaveBeenCalled();
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenLastCalledWith(
			'Document not part of a workspace, ignoring',
			{ uri: 'foo' },
		);
	});

	test('if document has already been checked, should not warn', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		mockContext.options.validate = ['bar'];

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenLastCalledWith(
			'Document has already been checked, ignoring',
			{ uri: 'foo' },
		);
	});

	test('if Stylelint package root cannot be determined, should not warn', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue(undefined);
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenLastCalledWith('Stylelint package root not found', {
			uri: 'foo',
		});
	});

	test('if Stylelint package manifest cannot be read, should not warn', async () => {
		const error = new Error('foo');

		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		fs.readFile.mockRejectedValue(error);

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenLastCalledWith(
			'Stylelint package manifest could not be read',
			{ uri: 'foo', manifestPath: '/path/node_modules/stylelint/package.json', error },
		);
	});

	test('if Stylelint package manifest is malformed, should not warn', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		fs.readFile.mockResolvedValue('{');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenLastCalledWith(
			'Stylelint package manifest could not be read',
			{
				uri: 'foo',
				manifestPath: '/path/node_modules/stylelint/package.json',
				error: expect.any(Error),
			},
		);
	});

	test('if Stylelint package manifest does not contain a version, should not warn', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		fs.readFile.mockResolvedValue('{}');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
	});

	test('if Stylelint version cannot be parsed, should not warn', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		fs.readFile.mockResolvedValue('{"version": "foo"}');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenLastCalledWith('Stylelint version could not be parsed', {
			uri: 'foo',
			version: 'foo',
			error: expect.any(Error),
		});
	});

	test('if Stylelint version is 14.x or greater, should not warn', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		fs.readFile.mockResolvedValue('{"version": "14.0.0"}');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).not.toHaveBeenCalled();
	});

	test('without openDocument support, if Stylelint version is less than 14.x, should warn and provide link to migration guide', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		fs.readFile.mockResolvedValue('{"version": "13.0.0"}');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(/** @type {any} */ ({ capabilities: {} }));

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage.mock.calls[0]).toMatchSnapshot();
		expect(mockContext.connection.window.showDocument).not.toHaveBeenCalled();
	});

	test("with openDocument support, if Stylelint version is less than 14.x and user doesn't click button, should warn but not open URL", async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		mockContext.connection.window.showWarningMessage.mockResolvedValue(undefined);
		fs.readFile.mockResolvedValue('{"version": "13.0.0"}');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(
			/** @type {any} */ ({
				capabilities: {
					window: {
						showDocument: { support: true },
					},
				},
			}),
		);

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showDocument).not.toHaveBeenCalled();
	});

	test('with openDocument support, if Stylelint version is less than 14.x and user clicks button, should warn and open URL', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		mockContext.connection.window.showWarningMessage.mockResolvedValue({
			title: 'Open migration guide',
		});
		mockContext.connection.window.showDocument.mockResolvedValue({
			success: true,
		});
		fs.readFile.mockResolvedValue('{"version": "13.0.0"}');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(
			/** @type {any} */ ({
				capabilities: {
					window: {
						showDocument: { support: true },
					},
				},
			}),
		);

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showDocument).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showDocument.mock.calls[0]).toMatchSnapshot();
		expect(mockLogger.warn).not.toHaveBeenCalledWith('Failed to open migration guide');
	});

	test('with openDocument support, if Stylelint version is less than 14.x and user clicks button, but fails to open URL, should warn and log', async () => {
		getWorkspaceFolder.mockResolvedValue('/path');
		findPackageRoot.mockResolvedValue('/path/node_modules/stylelint');
		mockContext.resolveStylelint.mockResolvedValue({
			stylelint: {},
			resolvedPath: '/path/node_modules/stylelint',
		});
		mockContext.options.validate = ['bar'];
		mockContext.connection.window.showWarningMessage.mockResolvedValue({
			title: 'Open migration guide',
		});
		mockContext.connection.window.showDocument.mockResolvedValue({
			success: false,
		});
		fs.readFile.mockResolvedValue('{"version": "13.0.0"}');

		const module = new OldStylelintWarningModule(getParams(true));

		module.onInitialize(
			/** @type {any} */ ({
				capabilities: {
					window: {
						showDocument: { support: true },
					},
				},
			}),
		);

		module.onDidRegisterHandlers();

		const handler = mockContext.documents.onDidOpen.mock.calls[0][0];

		await handler({
			document: { uri: 'foo', languageId: 'bar' },
		});

		expect(mockContext.resolveStylelint).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showWarningMessage).toHaveBeenCalledTimes(1);
		expect(mockContext.connection.window.showDocument).toHaveBeenCalledTimes(1);
		expect(mockLogger.warn).toHaveBeenCalledWith('Failed to open migration guide');
	});
});