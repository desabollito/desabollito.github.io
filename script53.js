var vendedorsServices = angular.module('vendedorServices', ['app.services']);

vendedorsServices.factory('Vendedor', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/vendedores', true, {
	        saveList: { method: 'POST' },
	        search: { method: 'GET', url: 'api/vendedores/search/:nombre', params: { nombre: '@nombre' }, isArray: true },
	        facturas: { method: 'GET', url: 'api/vendedores/:id/facturas?start=:start&length=:length', params: { id: '@id', start: '@start', length: '@length' }, isArray: true }
	    });
	}]);
